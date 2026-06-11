import { defineTokenGroup } from "@plugins/ui/plugins/theme-engine/core";

export const typeScaleGroup = defineTokenGroup("type-scale", {
  "font-size-2xs": { default: "0.6875rem", label: "Font size 2xs" },
  "font-size-3xs": { default: "0.625rem", label: "Font size 3xs" },
  "line-height-2xs": { default: "1rem", label: "Line height 2xs" },
  "line-height-3xs": { default: "0.875rem", label: "Line height 3xs" },
  fontWeightNormal: { default: "400", label: "Font weight normal" },
  fontWeightMedium: { default: "500", label: "Font weight medium" },
  fontWeightSemibold: { default: "600", label: "Font weight semibold" },
  fontWeightBold: { default: "700", label: "Font weight bold" },
  fontSizeTitle: { default: "1.25rem", label: "Font size title" },
  fontSizeHeading: { default: "1.125rem", label: "Font size heading" },
  fontSizeSubheading: { default: "1rem", label: "Font size subheading" },
  fontSizeBody: { default: "0.875rem", label: "Font size body" },
  fontSizeLabel: { default: "0.8125rem", label: "Font size label" },
  fontSizeCaption: { default: "0.75rem", label: "Font size caption" },
  lineHeightTitle: { default: "1.75rem", label: "Line height title" },
  lineHeightHeading: { default: "1.625rem", label: "Line height heading" },
  lineHeightSubheading: { default: "1.5rem", label: "Line height subheading" },
  lineHeightBody: { default: "1.5rem", label: "Line height body" },
  lineHeightLabel: { default: "1.25rem", label: "Line height label" },
  lineHeightCaption: { default: "1rem", label: "Line height caption" },
});

export type TypeScaleTokenValues = {
  [K in keyof typeof typeScaleGroup.schema]: string;
};
