import { defineConfig } from "@plugins/config/shared";

export const segmentedProgressBarConfig = defineConfig({
  variant: { default: "dots", label: "Segmented Progress Bar style" },
});
