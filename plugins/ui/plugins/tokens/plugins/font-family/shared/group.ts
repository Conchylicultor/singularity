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
});

export type FontFamilyTokenValues = {
  [K in keyof typeof fontFamilyGroup.schema]: string;
};
