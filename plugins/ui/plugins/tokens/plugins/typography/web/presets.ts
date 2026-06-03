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
    fontSize2xs: "0.6875rem",
    fontSize3xs: "0.625rem",
    lineHeight2xs: "1rem",
    lineHeight3xs: "0.875rem",
    fontWeightNormal: "400",
    fontWeightMedium: "500",
    fontWeightSemibold: "600",
    fontWeightBold: "700",
  }),
};

export const builtInPresets: Preset[] = [defaultPreset];
