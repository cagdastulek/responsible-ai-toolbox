// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { descriptionMaxWidth } from "@responsible-ai/core-ui";
import {
  IStyle,
  mergeStyleSets,
  IProcessedStyleSet,
  getTheme,
  FontWeights
} from "office-ui-fabric-react";

export interface IModelOverviewStyles {
  dropdown: IStyle;
  sectionStack: IStyle;
  configurationActionButton: IStyle;
  descriptionText: IStyle;
  generalText: IStyle;
  generalSemiBoldText: IStyle;
}

export const modelOverviewStyles: () => IProcessedStyleSet<IModelOverviewStyles> =
  () => {
    const theme = getTheme();
    return mergeStyleSets<IModelOverviewStyles>({
      configurationActionButton: {
        paddingTop: "44px"
      },
      descriptionText: {
        color: theme.semanticColors.bodyText,
        maxWidth: descriptionMaxWidth
      },
      dropdown: {
        width: "400px"
      },
      generalSemiBoldText: {
        color: theme.semanticColors.bodyText,
        fontWeight: FontWeights.semibold
      },
      generalText: {
        color: theme.semanticColors.bodyText
      },
      sectionStack: {
        padding: "0 40px 10px 40px"
      }
    });
  };