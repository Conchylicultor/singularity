import type { ChartTokenValues } from "../shared";

interface Preset {
  id: string;
  label: string;
  light: ChartTokenValues;
  dark: ChartTokenValues;
}

function both(values: ChartTokenValues): Pick<Preset, "light" | "dark"> {
  return { light: values, dark: values };
}

export const defaultPreset: Preset = {
  id: "default",
  label: "Default",
  ...both({
    "chart-1": "oklch(0.81 0.10 252)",
    "chart-2": "oklch(0.62 0.19 260)",
    "chart-3": "oklch(0.55 0.22 263)",
    "chart-4": "oklch(0.49 0.22 264)",
    "chart-5": "oklch(0.42 0.18 266)",
  }),
};

export const builtInPresets: Preset[] = [defaultPreset];
