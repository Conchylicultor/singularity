import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ComponentType } from "react";
import type { SegmentedProgressBarProps } from "../core";

export interface SegmentedProgressBarVariantContribution {
  id: string;
  label: string;
  component: ComponentType<SegmentedProgressBarProps>;
}

export const SegmentedProgressBar = {
  Variant: defineSlot<SegmentedProgressBarVariantContribution>(
    "ui.segmented-progress-bar.variant",
    { docLabel: (p) => p.label },
  ),
};
