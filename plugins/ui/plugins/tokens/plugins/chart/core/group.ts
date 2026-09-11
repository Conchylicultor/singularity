import { defineTokenGroup } from "@plugins/ui/plugins/theme-engine/core";

export const chartGroup = defineTokenGroup("chart", {
  "chart-1": { default: "oklch(0.81 0.10 252)", label: "Chart 1" },
  "chart-2": { default: "oklch(0.62 0.19 260)", label: "Chart 2" },
  "chart-3": { default: "oklch(0.55 0.22 263)", label: "Chart 3" },
  "chart-4": { default: "oklch(0.49 0.22 264)", label: "Chart 4" },
  "chart-5": { default: "oklch(0.42 0.18 266)", label: "Chart 5" },
});

export type ChartTokenValues = {
  [K in keyof typeof chartGroup.schema]: string;
};
