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
    controlHeightXs: "1.5rem",
    controlHeightSm: "1.75rem",
    controlHeightMd: "2rem",
    controlHeightLg: "2.25rem",
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
    controlHeightXs: "1.375rem",
    controlHeightSm: "1.625rem",
    controlHeightMd: "1.875rem",
    controlHeightLg: "2.125rem",
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
    controlHeightXs: "1.25rem",
    controlHeightSm: "1.5rem",
    controlHeightMd: "1.75rem",
    controlHeightLg: "2rem",
  }),
};

export const builtInPresets: Preset[] = [
  comfortablePreset,
  cozyPreset,
  compactPreset,
];
