import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { ChartTokenValues } from "../shared";

export interface ChartPresetContribution {
  id: string;
  label: string;
  light: ChartTokenValues;
  dark: ChartTokenValues;
}

export const Chart = {
  Preset: defineSlot<ChartPresetContribution>("ui.chart.preset", {
    docLabel: (p) => p.label,
  }),
};
