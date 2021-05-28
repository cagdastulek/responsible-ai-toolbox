// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
  AxisConfigDialog,
  ColumnCategories,
  WeightVectorOption,
  JointDataset,
  Cohort,
  ModelExplanationUtils,
  ChartTypes,
  IGenericChartProps,
  ISelectorConfig,
  MissingParametersPlaceholder,
  defaultModelAssessmentContext,
  ModelAssessmentContext,
  FabricStyles,
  rowErrorSize
} from "@responsible-ai/core-ui";
import {
  WhatIfConstants,
  LocalImportancePlots,
  IGlobalSeries
} from "@responsible-ai/interpret";
import { localization } from "@responsible-ai/localization";
import {
  AccessibleChart,
  IPlotlyProperty,
  PlotlyMode,
  IData
} from "@responsible-ai/mlchartlib";
import _ from "lodash";
import {
  getTheme,
  Text,
  DefaultButton,
  Dropdown,
  IDropdownOption,
  IComboBoxOption,
  ComboBox,
  IComboBox,
  PrimaryButton
} from "office-ui-fabric-react";
import React from "react";

import { counterfactualChartStyles } from "./CounterfactualChartStyles";
import { CounterfactualPanel } from "./CounterfactualPanel";
export interface ICounterfactualChartProps {
  selectedWeightVector: WeightVectorOption;
  weightOptions: WeightVectorOption[];
  weightLabels: any;
  invokeModel?: (data: any[], abortSignal: AbortSignal) => Promise<any[]>;
  onWeightChange: (option: WeightVectorOption) => void;
}

export interface ICounterfactualChartState {
  chartProps?: IGenericChartProps;
  xDialogOpen: boolean;
  yDialogOpen: boolean;
  isPanelOpen: boolean;
  customPoints: Array<{ [key: string]: any }>;
  selectedCohortIndex: number;
  featuresOption: IDropdownOption[];
  request?: AbortController;
  selectedPointsIndexes: number[];
  pointIsActive: boolean[];
  customPointIsActive: boolean[];
  sortArray: number[];
  sortingSeriesIndex: number | undefined;
  selectedCounterfactual: string | undefined;
  currentClass: string | undefined;
}

export class CounterfactualChart extends React.PureComponent<
  ICounterfactualChartProps,
  ICounterfactualChartState
> {
  public static contextType = ModelAssessmentContext;
  public context: React.ContextType<
    typeof ModelAssessmentContext
  > = defaultModelAssessmentContext;

  private readonly chartAndConfigsId = "IndividualFeatureImportanceChart";

  private includedFeatureImportance: IGlobalSeries[] = [];
  private selectedFeatureImportance: IGlobalSeries[] = [];
  private validationErrors: { [key: string]: string | undefined } = {};
  private stringifiedValues: { [key: string]: string } = {};
  private selectedDatapoints: any[][] = [];
  private customDatapoints: any[][] = [];
  private testableDatapoints: any[][] = [];
  private temporaryPoint: { [key: string]: any } | undefined;
  private testableDatapointColors: string[] = FabricStyles.fabricColorPalette;
  private testableDatapointNames: string[] = [];

  public constructor(props: ICounterfactualChartProps) {
    super(props);

    this.state = {
      currentClass: "maglinant",
      customPointIsActive: [],
      customPoints: [],
      featuresOption: [],
      isPanelOpen: false,
      pointIsActive: [],
      request: undefined,
      selectedCohortIndex: 0,
      selectedCounterfactual: undefined,
      selectedPointsIndexes: [],
      sortArray: [],
      sortingSeriesIndex: undefined,
      xDialogOpen: false,
      yDialogOpen: false
    };
  }

  public componentDidMount(): void {
    this.createCopyOfFirstRow();
    this.buildRowOptions(0);

    this.fetchData = _.debounce(this.fetchData.bind(this), 400);

    const featuresOption = new Array(
      this.context.jointDataset.datasetFeatureCount
    )
      .fill(0)
      .map((_, index) => {
        const key = JointDataset.DataLabelRoot + index.toString();
        const meta = this.context.jointDataset.metaDict[key];
        const options = meta.isCategorical
          ? meta.sortedCategoricalValues?.map((optionText, index) => {
              return { key: index, text: optionText };
            })
          : undefined;
        return {
          data: {
            categoricalOptions: options,
            fullLabel: meta.label.toLowerCase()
          },
          key,
          text: meta.abbridgedLabel
        };
      });

    this.setState({
      chartProps: this.generateDefaultChartAxes(),
      featuresOption
    });
  }

  public componentDidUpdate(
    prevProps: ICounterfactualChartProps,
    prevState: ICounterfactualChartState
  ): void {
    if (!this.state) {
      return;
    }
    let sortingSeriesIndex = this.state.sortingSeriesIndex;
    let sortArray = this.state.sortArray;
    const selectionsAreEqual = _.isEqual(
      this.state.selectedPointsIndexes,
      prevState.selectedPointsIndexes
    );
    const weightVectorsAreEqual =
      this.props.selectedWeightVector === prevProps.selectedWeightVector;
    const activePointsAreEqual = _.isEqual(
      this.state.pointIsActive,
      prevState.pointIsActive
    );
    const customPointsAreEqual =
      this.state.customPoints === prevState.customPoints;
    const customActivePointsAreEqual = _.isEqual(
      this.state.customPointIsActive,
      prevState.customPointIsActive
    );
    if (!selectionsAreEqual || !weightVectorsAreEqual) {
      this.selectedFeatureImportance = this.state.selectedPointsIndexes.map(
        (rowIndex, colorIndex) => {
          const row = this.context.jointDataset.getRow(rowIndex);
          return {
            colorIndex,
            id: rowIndex,
            name: localization.formatString(
              localization.Interpret.WhatIfTab.rowLabel,
              rowIndex.toString()
            ),
            unsortedAggregateY: JointDataset.localExplanationSlice(
              row,
              this.context.jointDataset.localExplanationFeatureCount
            ) as number[],
            unsortedFeatureValues: JointDataset.datasetSlice(
              row,
              this.context.jointDataset.metaDict,
              this.context.jointDataset.localExplanationFeatureCount
            )
          };
        }
      );
      this.selectedDatapoints = this.state.selectedPointsIndexes.map(
        (rowIndex) => {
          const row = this.context.jointDataset.getRow(rowIndex);
          return JointDataset.datasetSlice(
            row,
            this.context.jointDataset.metaDict,
            this.context.jointDataset.datasetFeatureCount
          );
        }
      );
      if (
        this.state.sortingSeriesIndex === undefined ||
        !this.state.selectedPointsIndexes.includes(
          this.state.sortingSeriesIndex
        )
      ) {
        if (this.state.selectedPointsIndexes.length !== 0) {
          sortingSeriesIndex = 0;
          sortArray = ModelExplanationUtils.getSortIndices(
            this.selectedFeatureImportance[0].unsortedAggregateY
          ).reverse();
        } else {
          sortingSeriesIndex = undefined;
        }
      } else if (!weightVectorsAreEqual) {
        sortArray = ModelExplanationUtils.getSortIndices(
          this.selectedFeatureImportance[0].unsortedAggregateY
        ).reverse();
      }
    }
    if (!customPointsAreEqual) {
      this.customDatapoints = this.state.customPoints.map((row) => {
        return JointDataset.datasetSlice(
          row,
          this.context.jointDataset.metaDict,
          this.context.jointDataset.datasetFeatureCount
        );
      });
    }
    if (
      !selectionsAreEqual ||
      !activePointsAreEqual ||
      !customPointsAreEqual ||
      !customActivePointsAreEqual ||
      !weightVectorsAreEqual
    ) {
      this.includedFeatureImportance = this.selectedFeatureImportance.filter(
        (_f, i) => this.state.pointIsActive[i]
      );
      const includedColors = this.includedFeatureImportance.map(
        (item) => FabricStyles.fabricColorPalette[item.colorIndex]
      );
      const includedNames = this.includedFeatureImportance.map(
        (item) => item.name
      );
      const includedRows = this.selectedDatapoints.filter(
        (_f, i) => this.state.pointIsActive[i]
      );
      const includedCustomRows = this.customDatapoints.filter((_f, i) => {
        if (this.state.pointIsActive[i]) {
          includedColors.push(
            FabricStyles.fabricColorPalette[
              WhatIfConstants.MAX_SELECTION + i + 1
            ]
          );
          includedColors.push(
            FabricStyles.fabricColorPalette[
              WhatIfConstants.MAX_SELECTION + i + 1
            ]
          );
          includedNames.push(
            this.state.customPoints[i][WhatIfConstants.namePath]
          );
          return true;
        }
        return false;
      });
      this.testableDatapoints = [...includedRows, ...includedCustomRows];
      this.testableDatapointColors = includedColors;
      this.testableDatapointNames = includedNames;
      this.forceUpdate();
    }
    this.setState({ sortArray, sortingSeriesIndex });
  }

  public render(): React.ReactNode {
    const classNames = counterfactualChartStyles();
    if (!this.context.jointDataset.hasDataset) {
      return (
        <MissingParametersPlaceholder>
          {localization.Interpret.WhatIfTab.missingParameters}
        </MissingParametersPlaceholder>
      );
    }
    if (this.state.chartProps === undefined) {
      return <div />;
    }
    const plotlyProps = this.generatePlotlyProps(
      this.context.jointDataset,
      this.state.chartProps,
      this.context.errorCohorts[this.state.selectedCohortIndex].cohort
    );
    const cohortLength = this.context.errorCohorts[
      this.state.selectedCohortIndex
    ].cohort.filteredData.length;
    const canRenderChart =
      cohortLength < rowErrorSize ||
      this.state.chartProps.chartType !== ChartTypes.Scatter;
    const cohortOptions: IDropdownOption[] = this.context.errorCohorts.map(
      (errorCohort, index) => {
        return { key: index, text: errorCohort.cohort.name };
      }
    );
    return (
      <div className={classNames.page}>
        <div className={classNames.mainArea}>
          <CounterfactualPanel
            selectedIndex={this.state.selectedPointsIndexes[0]}
            closePanel={this.togglePanel}
            isPanelOpen={this.state.isPanelOpen}
            data={this.context.counterfactualData}
          />
          <div className={classNames.chartsArea}>
            {cohortOptions && (
              <div className={classNames.cohortPickerWrapper}>
                <Text
                  variant="mediumPlus"
                  className={classNames.cohortPickerLabel}
                >
                  {localization.Counterfactuals.showOnly}
                </Text>
                <Dropdown
                  styles={{ dropdown: { width: 150 } }}
                  options={cohortOptions}
                  selectedKey={this.state.selectedCohortIndex}
                  onChange={this.setSelectedCohort}
                />
              </div>
            )}
            <div
              className={classNames.topArea}
              id={"IndividualFeatureContainer"}
            >
              <div
                className={classNames.chartWithAxes}
                id={this.chartAndConfigsId}
              >
                {this.state.yDialogOpen && (
                  <AxisConfigDialog
                    jointDataset={this.context.jointDataset}
                    orderedGroupTitles={[
                      ColumnCategories.Index,
                      ColumnCategories.Dataset,
                      ColumnCategories.Outcome
                    ]}
                    selectedColumn={this.state.chartProps.yAxis}
                    canBin={false}
                    mustBin={false}
                    canDither={
                      this.state.chartProps.chartType === ChartTypes.Scatter
                    }
                    onAccept={this.onYSet}
                    onCancel={this.setYOpen.bind(this, false)}
                  />
                )}
                {this.state.xDialogOpen && (
                  <AxisConfigDialog
                    jointDataset={this.context.jointDataset}
                    orderedGroupTitles={[
                      ColumnCategories.Index,
                      ColumnCategories.Dataset,
                      ColumnCategories.Outcome
                    ]}
                    selectedColumn={this.state.chartProps.xAxis}
                    canBin={
                      this.state.chartProps.chartType ===
                        ChartTypes.Histogram ||
                      this.state.chartProps.chartType === ChartTypes.Box
                    }
                    mustBin={
                      this.state.chartProps.chartType ===
                        ChartTypes.Histogram ||
                      this.state.chartProps.chartType === ChartTypes.Box
                    }
                    canDither={
                      this.state.chartProps.chartType === ChartTypes.Scatter
                    }
                    onAccept={this.onXSet}
                    onCancel={this.setXOpen.bind(this, false)}
                  />
                )}
                <div className={classNames.chartWithVertical}>
                  <div className={classNames.verticalAxis}>
                    <div className={classNames.rotatedVerticalBox}>
                      <DefaultButton
                        onClick={this.setYOpen.bind(this, true)}
                        text={
                          this.context.jointDataset.metaDict[
                            this.state.chartProps.yAxis.property
                          ].abbridgedLabel
                        }
                        title={
                          this.context.jointDataset.metaDict[
                            this.state.chartProps.yAxis.property
                          ].label
                        }
                      />
                    </div>
                  </div>
                  {!canRenderChart && (
                    <MissingParametersPlaceholder>
                      {localization.Interpret.ValidationErrors.datasizeError}
                    </MissingParametersPlaceholder>
                  )}
                  {canRenderChart && (
                    <AccessibleChart
                      plotlyProps={plotlyProps}
                      theme={getTheme() as any}
                      onClickHandler={this.selectPointFromChart}
                    />
                  )}
                </div>
                <div className={classNames.horizontalAxisWithPadding}>
                  <div className={classNames.paddingDiv} />
                  <div className={classNames.horizontalAxis}>
                    <div>
                      <DefaultButton
                        onClick={this.setXOpen.bind(this, true)}
                        text={
                          this.context.jointDataset.metaDict[
                            this.state.chartProps.xAxis.property
                          ].abbridgedLabel
                        }
                        title={
                          this.context.jointDataset.metaDict[
                            this.state.chartProps.xAxis.property
                          ].label
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className={classNames.legendAndText}>
                <ComboBox
                  className={classNames.legendLabel}
                  label={localization.Counterfactuals.selectedDatapoint}
                  onChange={this.selectPointFromDropdown}
                  options={this.getDataOptions()}
                  selectedKey={"" + this.state.selectedPointsIndexes[0]}
                  ariaLabel={"datapoint picker"}
                  useComboBoxAsMenuWidth
                  styles={FabricStyles.smallDropdownStyle}
                />
                <ComboBox
                  className={classNames.legendLabel}
                  label={localization.Counterfactuals.desiredClass}
                  onChange={this.selectCounterfactuals}
                  options={this.getCounterfactualsOptions()}
                  selectedKey={this.state.selectedCounterfactual}
                  ariaLabel={"counterfactuals picker"}
                  useComboBoxAsMenuWidth
                  styles={FabricStyles.smallDropdownStyle}
                />
                <div className={classNames.legendLabel}>
                  <b>{`${localization.Counterfactuals.currentClass}: `}</b>
                  {`${this.state.currentClass}`}
                </div>
                <PrimaryButton
                  className={classNames.legendLabel}
                  onClick={this.togglePanel}
                  disabled={
                    this.state.selectedPointsIndexes[0] === undefined ||
                    !this.state.selectedCounterfactual
                  }
                  text={localization.Counterfactuals.createCounterfactual}
                />
              </div>
            </div>
            <LocalImportancePlots
              includedFeatureImportance={this.includedFeatureImportance}
              jointDataset={this.context.jointDataset}
              metadata={this.context.modelMetadata}
              selectedWeightVector={this.props.selectedWeightVector}
              weightOptions={this.props.weightOptions}
              weightLabels={this.props.weightLabels}
              invokeModel={this.props.invokeModel}
              onWeightChange={this.props.onWeightChange}
              testableDatapoints={this.testableDatapoints}
              testableDatapointNames={this.testableDatapointNames}
              testableDatapointColors={this.testableDatapointColors}
              featuresOption={this.state.featuresOption}
              sortArray={this.state.sortArray}
              sortingSeriesIndex={this.state.sortingSeriesIndex}
            />
          </div>
        </div>
      </div>
    );
  }

  private getDefaultSelectedPointIndexes(cohort: Cohort): number[] {
    const indexes = cohort.unwrap(JointDataset.IndexLabel);
    if (indexes.length > 0) {
      return [indexes[0]];
    }
    return [];
  }

  private setSelectedCohort = (
    _event: React.FormEvent<HTMLDivElement>,
    item?: IDropdownOption
  ): void => {
    if (item?.key === undefined) {
      return;
    }
    this.buildRowOptions(item.key as number);
    this.setState({
      selectedCohortIndex: item.key as number,
      selectedPointsIndexes: []
    });
  };

  private buildRowOptions(cohortIndex: number): void {
    this.context.errorCohorts[cohortIndex].cohort.sort(JointDataset.IndexLabel);
  }

  private setTemporaryPointToCopyOfDatasetPoint(index: number): void {
    this.temporaryPoint = this.context.jointDataset.getRow(index);
    this.temporaryPoint[WhatIfConstants.namePath] = localization.formatString(
      localization.Interpret.WhatIf.defaultCustomRootName,
      index
    );
    this.temporaryPoint[WhatIfConstants.colorPath] =
      FabricStyles.fabricColorPalette[
        WhatIfConstants.MAX_SELECTION + this.state.customPoints.length
      ];
    Object.keys(this.temporaryPoint).forEach((key) => {
      this.stringifiedValues[key] = this.temporaryPoint?.[key].toString();
      this.validationErrors[key] = undefined;
    });
  }

  private createCopyOfFirstRow(): void {
    const indexes = this.getDefaultSelectedPointIndexes(
      this.context.errorCohorts[this.state.selectedCohortIndex].cohort
    );
    if (indexes.length === 0) {
      return undefined;
    }
    this.temporaryPoint = this.context.jointDataset.getRow(indexes[0]);
    this.temporaryPoint[WhatIfConstants.namePath] = localization.formatString(
      localization.Interpret.WhatIf.defaultCustomRootName,
      indexes[0]
    );
    this.temporaryPoint[WhatIfConstants.colorPath] =
      FabricStyles.fabricColorPalette[
        WhatIfConstants.MAX_SELECTION + this.state.customPoints.length
      ];
    Object.keys(this.temporaryPoint).forEach((key) => {
      this.stringifiedValues[key] = this.temporaryPoint?.[key].toString();
      this.validationErrors[key] = undefined;
    });
  }

  private onXSet = (value: ISelectorConfig): void => {
    if (!this.state.chartProps) {
      return;
    }
    const newProps = _.cloneDeep(this.state.chartProps);
    newProps.xAxis = value;
    this.setState({ chartProps: newProps, xDialogOpen: false });
  };

  private onYSet = (value: ISelectorConfig): void => {
    if (!this.state.chartProps) {
      return;
    }
    const newProps = _.cloneDeep(this.state.chartProps);
    newProps.yAxis = value;
    this.setState({ chartProps: newProps, yDialogOpen: false });
  };

  private readonly setXOpen = (val: boolean): void => {
    if (val && this.state.xDialogOpen === false) {
      this.setState({ xDialogOpen: true });
      return;
    }
    this.setState({ xDialogOpen: false });
  };

  private readonly setYOpen = (val: boolean): void => {
    if (val && this.state.yDialogOpen === false) {
      this.setState({ yDialogOpen: true });
      return;
    }
    this.setState({ yDialogOpen: false });
  };

  private selectPointFromChart = (data: any): void => {
    const trace = data.points[0];
    const index = trace.customdata[JointDataset.IndexLabel];
    this.setTemporaryPointToCopyOfDatasetPoint(index);
    this.toggleSelectionOfPoint(index);
  };

  private toggleSelectionOfPoint(index?: number): void {
    if (index === undefined) {
      return;
    }
    const indexOf = this.state.selectedPointsIndexes.indexOf(index);
    let newSelections = [...this.state.selectedPointsIndexes];
    let pointIsActive = [...this.state.pointIsActive];
    if (indexOf === -1) {
      newSelections = [index];
      pointIsActive = [true];
    } else {
      newSelections.splice(indexOf, 1);
      pointIsActive.splice(indexOf, 1);
    }
    this.setState({
      pointIsActive,
      selectedPointsIndexes: newSelections
    });
  }

  // fetch prediction for temporary point
  private fetchData(fetchingReference: { [key: string]: any }): void {
    if (!this.props.invokeModel) {
      return;
    }
    if (this.state.request !== undefined) {
      this.state.request.abort();
    }
    const abortController = new AbortController();
    const rawData = JointDataset.datasetSlice(
      fetchingReference,
      this.context.jointDataset.metaDict,
      this.context.jointDataset.datasetFeatureCount
    );
    fetchingReference[JointDataset.PredictedYLabel] = undefined;
    const promise = this.props.invokeModel([rawData], abortController.signal);

    this.setState({ request: abortController }, async () => {
      try {
        const fetchedData = await promise;
        // returns predicted probabilities
        if (Array.isArray(fetchedData[0])) {
          const predictionVector = fetchedData[0];
          let predictedClass = 0;
          let maxProb = Number.MIN_SAFE_INTEGER;
          for (const [i, element] of predictionVector.entries()) {
            fetchingReference[
              JointDataset.ProbabilityYRoot + i.toString()
            ] = element;
            if (element > maxProb) {
              predictedClass = i;
              maxProb = element;
            }
          }
          fetchingReference[JointDataset.PredictedYLabel] = predictedClass;
        } else {
          // prediction is a scalar, no probabilities
          fetchingReference[JointDataset.PredictedYLabel] = fetchedData[0];
        }
        if (this.context.jointDataset.hasTrueY) {
          JointDataset.setErrorMetrics(
            fetchingReference,
            this.context.modelMetadata.modelType
          );
        }
        this.setState({ request: undefined });
      } catch (error) {
        if (error.name === "AbortError") {
          return;
        }
        if (error.name === "PythonError") {
          alert(
            localization.formatString(
              localization.Interpret.IcePlot.errorPrefix,
              error.message
            )
          );
        }
      }
    });
  }

  private generatePlotlyProps(
    jointData: JointDataset,
    chartProps: IGenericChartProps,
    cohort: Cohort
  ): IPlotlyProperty {
    const plotlyProps = _.cloneDeep(WhatIfConstants.basePlotlyProperties);
    plotlyProps.data[0].hoverinfo = "all";
    const indexes = cohort.unwrap(JointDataset.IndexLabel);
    plotlyProps.data[0].type = chartProps.chartType;
    plotlyProps.data[0].mode = PlotlyMode.Markers;
    plotlyProps.data[0].marker = {
      color: indexes.map((rowIndex) => {
        const selectionIndex = this.state.selectedPointsIndexes.indexOf(
          rowIndex
        );
        if (selectionIndex === -1) {
          return FabricStyles.fabricColorInactiveSeries;
        }
        return FabricStyles.fabricColorPalette[selectionIndex];
      }) as any,
      size: 8,
      symbol: indexes.map((i) =>
        this.state.selectedPointsIndexes.includes(i) ? "square" : "circle"
      ) as any
    };

    plotlyProps.data[1] = {
      marker: {
        color: this.state.customPoints.map(
          (_, i) =>
            FabricStyles.fabricColorPalette[
              WhatIfConstants.MAX_SELECTION + 1 + i
            ]
        ),
        size: 12,
        symbol: "star"
      },
      mode: PlotlyMode.Markers,
      type: "scatter"
    };

    plotlyProps.data[2] = {
      hoverinfo: "text",
      marker: {
        color: "rgba(0,0,0,0)",
        line: {
          color:
            FabricStyles.fabricColorPalette[
              WhatIfConstants.MAX_SELECTION + 1 + this.state.customPoints.length
            ],
          width: 2
        },
        opacity: 0.5,
        size: 12,
        symbol: "star"
      },
      mode: PlotlyMode.Markers,
      text: "Editable What-If point",
      type: "scatter"
    };

    if (chartProps.xAxis) {
      if (jointData.metaDict[chartProps.xAxis.property].treatAsCategorical) {
        const xLabels =
          jointData.metaDict[chartProps.xAxis.property].sortedCategoricalValues;
        const xLabelIndexes = xLabels?.map((_, index) => index);
        _.set(plotlyProps, "layout.xaxis.ticktext", xLabels);
        _.set(plotlyProps, "layout.xaxis.tickvals", xLabelIndexes);
      }
    }
    if (chartProps.yAxis) {
      if (jointData.metaDict[chartProps.yAxis.property].treatAsCategorical) {
        const yLabels =
          jointData.metaDict[chartProps.yAxis.property].sortedCategoricalValues;
        const yLabelIndexes = yLabels?.map((_, index) => index);
        _.set(plotlyProps, "layout.yaxis.ticktext", yLabels);
        _.set(plotlyProps, "layout.yaxis.tickvals", yLabelIndexes);
      }
    }

    this.generateDataTrace(
      cohort.filteredData,
      chartProps,
      plotlyProps.data[0]
    );
    this.generateDataTrace(
      this.state.customPoints,
      chartProps,
      plotlyProps.data[1]
    );
    if (this.temporaryPoint) {
      this.generateDataTrace(
        [this.temporaryPoint],
        chartProps,
        plotlyProps.data[2]
      );
    }
    return plotlyProps;
  }

  private generateDataTrace(
    dictionary: Array<{ [key: string]: number }>,
    chartProps: IGenericChartProps,
    trace: IData
  ): void {
    const customdata = JointDataset.unwrap(
      dictionary,
      JointDataset.IndexLabel
    ).map((val) => {
      const dict = {};
      dict[JointDataset.IndexLabel] = val;
      return dict;
    });
    let hovertemplate = "";
    if (chartProps.xAxis) {
      const metaX = this.context.jointDataset.metaDict[
        chartProps.xAxis.property
      ];
      const rawX = JointDataset.unwrap(dictionary, chartProps.xAxis.property);
      hovertemplate += metaX.label + ": %{customdata.X}<br>";

      rawX.forEach((val, index) => {
        if (metaX.treatAsCategorical) {
          customdata[index]["X"] = metaX.sortedCategoricalValues?.[val];
        } else {
          customdata[index]["X"] = (val as number).toLocaleString(undefined, {
            maximumSignificantDigits: 5
          });
        }
      });
      if (chartProps.xAxis.options.dither) {
        const dither = JointDataset.unwrap(
          dictionary,
          JointDataset.DitherLabel
        );
        trace.x = dither.map((ditherVal, index) => {
          return rawX[index] + ditherVal;
        });
      } else {
        trace.x = rawX;
      }
    }
    if (chartProps.yAxis) {
      const metaY = this.context.jointDataset.metaDict[
        chartProps.yAxis.property
      ];
      const rawY = JointDataset.unwrap(dictionary, chartProps.yAxis.property);
      hovertemplate += metaY.label + ": %{customdata.Y}<br>";
      rawY.forEach((val, index) => {
        if (metaY.treatAsCategorical) {
          customdata[index]["Y"] = metaY.sortedCategoricalValues?.[val];
        } else {
          customdata[index]["Y"] = (val as number).toLocaleString(undefined, {
            maximumSignificantDigits: 5
          });
        }
      });
      if (chartProps.yAxis.options.dither) {
        const dither = JointDataset.unwrap(
          dictionary,
          JointDataset.DitherLabel2
        );
        trace.y = dither.map((ditherVal, index) => {
          return rawY[index] + ditherVal;
        });
      } else {
        trace.y = rawY;
      }
    }
    hovertemplate +=
      localization.Interpret.Charts.rowIndex + ": %{customdata.Index}<br>";
    hovertemplate += "<extra></extra>";
    trace.customdata = customdata as any;
    trace.hovertemplate = hovertemplate;
  }

  private generateDefaultChartAxes(): IGenericChartProps | undefined {
    const yKey = JointDataset.DataLabelRoot + "0";
    const yIsDithered = this.context.jointDataset.metaDict[yKey]
      .treatAsCategorical;
    const chartProps: IGenericChartProps = {
      chartType: ChartTypes.Scatter,
      xAxis: {
        options: {},
        property: this.context.jointDataset.hasPredictedProbabilities
          ? JointDataset.ProbabilityYRoot + "0"
          : JointDataset.IndexLabel
      },
      yAxis: {
        options: {
          bin: false,
          dither: yIsDithered
        },
        property: yKey
      }
    };
    return chartProps;
  }

  private selectPointFromDropdown = (
    _event: React.FormEvent<IComboBox>,
    item?: IComboBoxOption
  ): void => {
    if (typeof item?.key === "string") {
      const index = Number.parseInt(item.key);
      this.setTemporaryPointToCopyOfDatasetPoint(index);
      this.toggleSelectionOfPoint(index);
    }
  };

  private selectCounterfactuals = (
    _event: React.FormEvent<IComboBox>,
    item?: IComboBoxOption
  ): void => {
    if (typeof item?.key === "string") {
      this.setState({
        selectedCounterfactual: item.key
      });
    }
  };

  private getDataOptions(): IComboBoxOption[] {
    const indexes = this.context.errorCohorts[
      this.state.selectedCohortIndex
    ].cohort.unwrap(JointDataset.IndexLabel);
    indexes.sort((a, b) => Number.parseInt(a) - Number.parseInt(b));
    return indexes.map((index) => {
      return {
        key: "" + index,
        text: `Index ${index}`
      };
    });
  }
  private togglePanel = (): void => {
    this.setState((preState) => {
      return { isPanelOpen: !preState.isPanelOpen };
    });
  };

  private getCounterfactualsOptions(): IComboBoxOption[] {
    return [
      {
        key: "benign",
        text: "benign"
      },
      {
        key: "malignant",
        text: "malignant"
      }
    ];
  }
}