// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import {
  ConstrainMode,
  DetailsList,
  DetailsListLayoutMode,
  Fabric,
  IGroup,
  MarqueeSelection,
  mergeStyles,
  ScrollablePane,
  ScrollbarVisibility,
  SelectAllVisibility,
  Selection,
  SelectionMode,
  Stack,
  Text
} from "@fluentui/react";
import {
  constructCols,
  constructRows,
  defaultModelAssessmentContext,
  JointDataset,
  ModelTypes,
  LabelWithCallout,
  ModelAssessmentContext,
  TelemetryEventName,
  TelemetryLevels
} from "@responsible-ai/core-ui";
import { localization } from "@responsible-ai/localization";
import React from "react";

import { tableViewStyles } from "./TableView.styles";
import { generateOnRenderDetailsHeader } from "./TableViewDetailsHeader";
import { onRenderGroupHeader } from "./TableViewGroupHeader";
import { ITableViewProps } from "./TableViewProps";
import { IITableViewState, ITableViewTableState } from "./TableViewState";

// Constants related to table view height, which should change in mini-view with num rows
const headerHeight = 80;
const rowHeight = 44;
const maxHeight = 500;

export class TableView extends React.Component<
  ITableViewProps,
  IITableViewState
> {
  public static contextType = ModelAssessmentContext;
  public context: React.ContextType<typeof ModelAssessmentContext> =
    defaultModelAssessmentContext;
  private readonly maxSelectableTabular = 5;
  private readonly maxSelectableText = 1;
  private selection: Selection = new Selection({
    onSelectionChanged: (): void => {
      const c = this.selection.getSelectedCount();
      const indices = this.selection.getSelectedIndices();
      const hasTextImportances =
        !!this.context.modelExplanationData?.precomputedExplanations
          ?.textFeatureImportance;
      const maxSelectable = hasTextImportances
        ? this.maxSelectableText
        : this.maxSelectableTabular;
      if (c === maxSelectable) {
        this.setState({ selectedIndices: indices });
      }
      if (c > maxSelectable) {
        for (const index of indices) {
          if (!this.state.selectedIndices.includes(index)) {
            this.setState({ indexToUnselect: index });
          }
        }
      }
      this.props.onAllSelectedItemsChange(this.selection.getSelection());
      this.props.telemetryHook?.({
        level: TelemetryLevels.ButtonClick,
        type: TelemetryEventName.IndividualFeatureImportanceSelectedDatapointsUpdated
      });
    }
  });

  public constructor(props: ITableViewProps) {
    super(props);

    const tableState = this.updateItems();
    const selectedIndices: number[] = [];

    this.state = {
      indexToUnselect: undefined,
      selectedIndices,
      ...tableState
    };

    if (this.props.subsetSelectedItems) {
      this.selection.setItems(tableState.rows);
      this.props.subsetSelectedItems.forEach((_, index) =>
        this.selection.setIndexSelected(index, true, true)
      );
    }
  }

  public componentDidUpdate(prevProps: ITableViewProps): void {
    if (
      this.props.selectedCohort !== prevProps.selectedCohort ||
      this.props.subsetSelectedItems !== prevProps.subsetSelectedItems
    ) {
      const newItems = this.updateItems();
      let selectedIndices = this.state.selectedIndices;
      if (this.props.subsetSelectedItems) {
        this.selection.setItems(newItems.rows);
        selectedIndices = this.props.subsetSelectedItems.map(
          (_, index) => index
        );
        selectedIndices.forEach((index) =>
          this.selection.setIndexSelected(index, true, true)
        );
      }
      this.setState(newItems, () => this.setState({ selectedIndices }));
    }
    if (this.state.indexToUnselect) {
      this.selection.toggleIndexSelected(this.state.indexToUnselect);
      this.setState({ indexToUnselect: undefined });
    }
  }

  public render(): React.ReactNode {
    if (
      this.state.rows === undefined ||
      this.state.columns === undefined ||
      this.state.rows.length === 0
    ) {
      return React.Fragment;
    }
    const hasTextImportances =
      !!this.context.modelExplanationData?.precomputedExplanations
        ?.textFeatureImportance;
    const classNames = tableViewStyles();
    let height = this.state.rows.length * rowHeight + headerHeight;
    if (height > maxHeight) {
      height = maxHeight;
    }
    let selectAllVisibility = SelectAllVisibility.hidden;
    let selectionMode = SelectionMode.multiple;
    if (hasTextImportances) {
      if (this.props.subsetSelectedItems) {
        selectAllVisibility = SelectAllVisibility.none;
        selectionMode = SelectionMode.none;
      } else {
        selectionMode = SelectionMode.single;
      }
    }
    return (
      <Stack>
        {!hasTextImportances && (
          <Stack.Item className={classNames.selectionCounter}>
            <LabelWithCallout
              label={localization.formatString(
                localization.ModelAssessment.FeatureImportances
                  .SelectionCounter,
                this.selection.count,
                this.maxSelectableTabular
              )}
              calloutTitle={undefined}
              renderOnNewLayer
              type="label"
            >
              <Text>
                {localization.ModelAssessment.FeatureImportances.SelectionLimit}
              </Text>
            </LabelWithCallout>
          </Stack.Item>
        )}
        <Stack.Item className={classNames.tabularDataView}>
          <div
            className={mergeStyles(classNames.detailsList, {
              height: `${height.toString()}px`
            })}
          >
            <Fabric>
              <ScrollablePane scrollbarVisibility={ScrollbarVisibility.auto}>
                <MarqueeSelection selection={this.selection}>
                  <DetailsList
                    items={this.state.rows}
                    columns={this.state.columns}
                    groups={this.state.groups}
                    setKey="set"
                    layoutMode={DetailsListLayoutMode.fixedColumns}
                    constrainMode={ConstrainMode.unconstrained}
                    onRenderDetailsHeader={generateOnRenderDetailsHeader(
                      selectAllVisibility
                    )}
                    selectionPreservedOnEmptyClick
                    ariaLabelForSelectionColumn={
                      localization.ModelAssessment.FeatureImportances
                        .SelectionColumnAriaLabel
                    }
                    checkButtonAriaLabel={
                      localization.ModelAssessment.FeatureImportances
                        .RowCheckboxAriaLabel
                    }
                    groupProps={{
                      onRenderHeader: onRenderGroupHeader,
                      showEmptyGroups: true
                    }}
                    selectionMode={selectionMode}
                    selection={this.selection}
                  />
                </MarqueeSelection>
              </ScrollablePane>
            </Fabric>
          </div>
        </Stack.Item>
      </Stack>
    );
  }

  private updateItems(): ITableViewTableState {
    let groups: IGroup[] | undefined;

    let filteredDataRows: Array<{ [key: string]: number }> = [];
    if (this.props.subsetSelectedItems) {
      filteredDataRows = this.props.subsetSelectedItems.map((row) => {
        return this.props.jointDataset.getRow(row[0]);
      });
    } else {
      // assume classifier by default, otherwise regressor
      if (
        this.props.modelType &&
        this.props.modelType === ModelTypes.Regression
      ) {
        // don't use groups since there are no correct/incorrect buckets
        this.props.selectedCohort.cohort.sort();
      } else {
        this.props.selectedCohort.cohort.sortByGroup(
          JointDataset.IndexLabel,
          (row) =>
            row[JointDataset.TrueYLabel] === row[JointDataset.PredictedYLabel]
        );
        // find first incorrect item
        const firstIncorrectItemIndex =
          this.props.selectedCohort.cohort.filteredData.findIndex(
            (row) =>
              row[JointDataset.TrueYLabel] !== row[JointDataset.PredictedYLabel]
          );
        const noIncorrectItem = firstIncorrectItemIndex === -1;

        groups = [
          {
            count: noIncorrectItem
              ? this.props.selectedCohort.cohort.filteredData.length
              : firstIncorrectItemIndex,
            isCollapsed: true,
            key: "groupCorrect",
            level: 0,
            name: localization.ModelAssessment.FeatureImportances
              .CorrectPredictions,
            startIndex: 0
          },
          {
            count: noIncorrectItem
              ? 0
              : this.props.selectedCohort.cohort.filteredData.length -
                firstIncorrectItemIndex,
            key: "groupIncorrect",
            level: 0,
            name: localization.ModelAssessment.FeatureImportances
              .IncorrectPredictions,
            startIndex: firstIncorrectItemIndex
          }
        ];
      }
      filteredDataRows = this.props.selectedCohort.cohort.filteredData;
    }

    const numRows: number = filteredDataRows.length;
    const indices = filteredDataRows.map((row: { [key: string]: number }) => {
      return row[JointDataset.IndexLabel] as number;
    });

    const rows = constructRows(
      filteredDataRows,
      this.props.jointDataset,
      numRows,
      () => false, // don't filter any items
      indices
    );

    const numCols: number = this.props.jointDataset.datasetFeatureCount;
    const featureNames: string[] = this.props.features;
    const viewedCols: number = Math.min(numCols, featureNames.length);
    const columns = constructCols(
      viewedCols,
      featureNames,
      this.props.jointDataset,
      false
    );

    return {
      columns,
      groups,
      rows
    };
  }
}
