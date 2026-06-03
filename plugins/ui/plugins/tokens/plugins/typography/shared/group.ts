import { defineTokenGroup } from "@plugins/ui/plugins/theme-engine/core";

export const typographyGroup = defineTokenGroup("typography", {
  fontSans: { default: "'Inter Variable', sans-serif", label: "Sans font" },
  fontSerif: {
    default: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
    label: "Serif font",
  },
  fontMono: {
    default: "'Cascadia Code Variable', monospace",
    label: "Mono font",
  },
  letterSpacing: { default: "0em", label: "Letter spacing" },
  fontSize2xs: { default: "0.6875rem", label: "Font size 2xs" },
  fontSize3xs: { default: "0.625rem", label: "Font size 3xs" },
  lineHeight2xs: { default: "1rem", label: "Line height 2xs" },
  lineHeight3xs: { default: "0.875rem", label: "Line height 3xs" },
  fontWeightNormal: { default: "400", label: "Font weight normal" },
  fontWeightMedium: { default: "500", label: "Font weight medium" },
  fontWeightSemibold: { default: "600", label: "Font weight semibold" },
  fontWeightBold: { default: "700", label: "Font weight bold" },
});

export type TypographyTokenValues = {
  [K in keyof typeof typographyGroup.schema]: string;
};
