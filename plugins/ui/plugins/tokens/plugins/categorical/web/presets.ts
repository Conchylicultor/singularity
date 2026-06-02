import type { CategoricalTokenValues } from "../shared";

interface Preset {
  id: string;
  label: string;
  light: CategoricalTokenValues;
  dark: CategoricalTokenValues;
}

export const defaultPreset: Preset = {
  id: "default",
  label: "Default",
  light: {
    "categorical-1": "oklch(0.68 0.14 230)",
    "categorical-2": "oklch(0.70 0.15 160)",
    "categorical-3": "oklch(0.75 0.15 70)",
    "categorical-4": "oklch(0.65 0.20 15)",
    "categorical-5": "oklch(0.60 0.20 295)",
    "categorical-6": "oklch(0.55 0.20 270)",
    "categorical-7": "oklch(0.70 0.12 190)",
    "categorical-8": "oklch(0.68 0.20 350)",
    "categorical-9": "oklch(0.70 0.17 50)",
    "categorical-10": "oklch(0.55 0.03 250)",
  },
  dark: {
    "categorical-1": "oklch(0.78 0.13 230)",
    "categorical-2": "oklch(0.80 0.14 160)",
    "categorical-3": "oklch(0.83 0.14 70)",
    "categorical-4": "oklch(0.75 0.17 15)",
    "categorical-5": "oklch(0.72 0.17 295)",
    "categorical-6": "oklch(0.70 0.16 270)",
    "categorical-7": "oklch(0.80 0.11 190)",
    "categorical-8": "oklch(0.78 0.17 350)",
    "categorical-9": "oklch(0.80 0.15 50)",
    "categorical-10": "oklch(0.70 0.03 250)",
  },
};

export const builtInPresets: Preset[] = [defaultPreset];
