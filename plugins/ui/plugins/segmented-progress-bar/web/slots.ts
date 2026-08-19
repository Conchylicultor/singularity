import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ComponentType } from "react";
import type { SegmentedProgressBarProps } from "../core";

export interface SegmentedProgressBarVariantContribution {
  id: string;
  label: string;
  /**
   * Dispatch match key — set to the same string as `id`.
   * The render site uses `renderIsolated` for bespoke selection because the
   * slot serves dual duty: listing variants for the picker AND dispatching to
   * the active renderer.
   */
  match: string;
  component: ComponentType<SegmentedProgressBarProps>;
}

export const SegmentedProgressBar = {
  Variant: defineSlot<SegmentedProgressBarVariantContribution>({
    docLabel: (p) => p.label,
  }),
};
