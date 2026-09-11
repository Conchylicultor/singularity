import { defineTokenGroup } from "@plugins/ui/plugins/theme-engine/core";

export const categoricalGroup = defineTokenGroup("categorical", {
  "categorical-1": {
    default: "oklch(0.68 0.14 230)",
    darkDefault: "oklch(0.78 0.13 230)",
    label: "Categorical 1",
  },
  "categorical-2": {
    default: "oklch(0.70 0.15 160)",
    darkDefault: "oklch(0.80 0.14 160)",
    label: "Categorical 2",
  },
  "categorical-3": {
    default: "oklch(0.75 0.15 70)",
    darkDefault: "oklch(0.83 0.14 70)",
    label: "Categorical 3",
  },
  "categorical-4": {
    default: "oklch(0.65 0.20 15)",
    darkDefault: "oklch(0.75 0.17 15)",
    label: "Categorical 4",
  },
  "categorical-5": {
    default: "oklch(0.60 0.20 295)",
    darkDefault: "oklch(0.72 0.17 295)",
    label: "Categorical 5",
  },
  "categorical-6": {
    default: "oklch(0.55 0.20 270)",
    darkDefault: "oklch(0.70 0.16 270)",
    label: "Categorical 6",
  },
  "categorical-7": {
    default: "oklch(0.70 0.12 190)",
    darkDefault: "oklch(0.80 0.11 190)",
    label: "Categorical 7",
  },
  "categorical-8": {
    default: "oklch(0.68 0.20 350)",
    darkDefault: "oklch(0.78 0.17 350)",
    label: "Categorical 8",
  },
  "categorical-9": {
    default: "oklch(0.70 0.17 50)",
    darkDefault: "oklch(0.80 0.15 50)",
    label: "Categorical 9",
  },
  "categorical-10": {
    default: "oklch(0.55 0.03 250)",
    darkDefault: "oklch(0.70 0.03 250)",
    label: "Categorical 10",
  },
});

export type CategoricalTokenValues = {
  [K in keyof typeof categoricalGroup.schema]: string;
};
