import type { TypographyTokenValues } from "../shared";

interface Preset {
  id: string;
  label: string;
  light: TypographyTokenValues;
  dark: TypographyTokenValues;
}

function both(values: TypographyTokenValues): Pick<Preset, "light" | "dark"> {
  return { light: values, dark: values };
}

export const defaultPreset: Preset = {
  id: "default",
  label: "Default",
  ...both({
    fontSans: "'Inter Variable', sans-serif",
    fontSerif: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
    fontMono: "'Cascadia Code Variable', monospace",
    letterSpacing: "0em",
    "font-size-2xs": "0.6875rem",
    "font-size-3xs": "0.625rem",
    "line-height-2xs": "1rem",
    "line-height-3xs": "0.875rem",
    fontWeightNormal: "400",
    fontWeightMedium: "500",
    fontWeightSemibold: "600",
    fontWeightBold: "700",
    fontSizeTitle: "1.25rem",
    fontSizeHeading: "1.125rem",
    fontSizeSubheading: "1rem",
    fontSizeBody: "0.875rem",
    fontSizeLabel: "0.8125rem",
    fontSizeCaption: "0.75rem",
    lineHeightTitle: "1.75rem",
    lineHeightHeading: "1.625rem",
    lineHeightSubheading: "1.5rem",
    lineHeightBody: "1.5rem",
    lineHeightLabel: "1.25rem",
    lineHeightCaption: "1rem",
  }),
};

export const builtInPresets: Preset[] = [defaultPreset];
