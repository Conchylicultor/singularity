import { defineConfig } from "@plugins/config/core";

export const segmentedProgressBarConfig = defineConfig({
  variant: { default: "dots", label: "Segmented Progress Bar style" },
});
