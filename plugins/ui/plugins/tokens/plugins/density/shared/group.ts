import { defineTokenGroup } from "@plugins/ui/plugins/theme-engine/core";

export const densityGroup = defineTokenGroup("density", {
  padChipX: { default: "0.375rem", label: "Chip padding X" },
  padChipY: { default: "0.125rem", label: "Chip padding Y" },
  padControlX: { default: "0.75rem", label: "Control padding X" },
  padControlY: { default: "0.375rem", label: "Control padding Y" },
  padRowX: { default: "0.5rem", label: "Row padding X" },
  padRowY: { default: "0.375rem", label: "Row padding Y" },
  controlHeightXs: { default: "1.5rem", label: "Control height XS" },
  controlHeightSm: { default: "1.75rem", label: "Control height SM" },
  controlHeightMd: { default: "2rem", label: "Control height MD" },
  controlHeightLg: { default: "2.25rem", label: "Control height LG" },
});

export type DensityTokenValues = {
  [K in keyof typeof densityGroup.schema]: string;
};
