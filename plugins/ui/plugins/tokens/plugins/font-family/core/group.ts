import { defineTokenGroup } from "@plugins/ui/plugins/theme-engine/core";

export const fontFamilyGroup = defineTokenGroup("font-family", {
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
  // `-webkit-font-smoothing` (macOS): `auto` lets the browser thicken glyph
  // stems, which light text on a dark ground shows the most; `antialiased`
  // draws them at the font's own weight.
  fontSmoothing: { default: "auto", label: "Font smoothing" },
});

export type FontFamilyTokenValues = {
  [K in keyof typeof fontFamilyGroup.schema]: string;
};
