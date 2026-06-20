import type { DensityTokenValues } from "../shared";

interface Preset {
  id: string;
  label: string;
  light: DensityTokenValues;
  dark: DensityTokenValues;
}

function both(values: DensityTokenValues): Pick<Preset, "light" | "dark"> {
  return { light: values, dark: values };
}

export const comfortablePreset: Preset = {
  id: "comfortable",
  label: "Comfortable",
  ...both({
    padChipX: "0.375rem",
    padChipY: "0.125rem",
    padControlX: "0.75rem",
    padControlY: "0.375rem",
    padRowX: "0.5rem",
    padRowY: "0.375rem",
    padCard: "0.75rem",
    controlHeightXs: "1.5rem",
    controlHeightSm: "1.75rem",
    controlHeightMd: "2rem",
    controlHeightLg: "2.25rem",
    chromeBarH: "3rem",
    chromePaneH: "2.5rem",
    chromePadX: "0.75rem",
    "space-2xs": "0.125rem",
    "space-xs": "0.25rem",
    "space-sm": "0.5rem",
    "space-md": "0.75rem",
    "space-lg": "1rem",
    "space-xl": "1.5rem",
    "space-2xl": "2rem",
  }),
};

export const cozyPreset: Preset = {
  id: "cozy",
  label: "Cozy",
  ...both({
    padChipX: "0.3125rem",
    padChipY: "0.0625rem",
    padControlX: "0.625rem",
    padControlY: "0.25rem",
    padRowX: "0.375rem",
    padRowY: "0.25rem",
    padCard: "0.625rem",
    controlHeightXs: "1.375rem",
    controlHeightSm: "1.625rem",
    controlHeightMd: "1.875rem",
    controlHeightLg: "2.125rem",
    chromeBarH: "2.75rem",
    chromePaneH: "2.25rem",
    chromePadX: "0.625rem",
    "space-2xs": "0.125rem",
    "space-xs": "0.1875rem",
    "space-sm": "0.375rem",
    "space-md": "0.625rem",
    "space-lg": "0.875rem",
    "space-xl": "1.25rem",
    "space-2xl": "1.75rem",
  }),
};

export const compactPreset: Preset = {
  id: "compact",
  label: "Compact",
  ...both({
    padChipX: "0.25rem",
    padChipY: "0rem",
    padControlX: "0.5rem",
    padControlY: "0.125rem",
    padRowX: "0.25rem",
    padRowY: "0.125rem",
    padCard: "0.5rem",
    controlHeightXs: "1.25rem",
    controlHeightSm: "1.5rem",
    controlHeightMd: "1.75rem",
    controlHeightLg: "2rem",
    chromeBarH: "2.5rem",
    chromePaneH: "2rem",
    chromePadX: "0.5rem",
    "space-2xs": "0.0625rem",
    "space-xs": "0.125rem",
    "space-sm": "0.25rem",
    "space-md": "0.5rem",
    "space-lg": "0.75rem",
    "space-xl": "1rem",
    "space-2xl": "1.5rem",
  }),
};

export const builtInPresets: Preset[] = [
  comfortablePreset,
  cozyPreset,
  compactPreset,
];
