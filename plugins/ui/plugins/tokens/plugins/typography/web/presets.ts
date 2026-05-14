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
  }),
};

export const builtInPresets: Preset[] = [defaultPreset];
