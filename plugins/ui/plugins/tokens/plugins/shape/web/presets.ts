import type { ShapeTokenValues } from "../internal";

interface Preset {
  id: string;
  label: string;
  light: ShapeTokenValues;
  dark: ShapeTokenValues;
}

function both(values: ShapeTokenValues): Pick<Preset, "light" | "dark"> {
  return { light: values, dark: values };
}

export const defaultPreset: Preset = {
  id: "default",
  label: "Default",
  ...both({ radius: "0.625rem" }),
};

export const sharpPreset: Preset = {
  id: "sharp",
  label: "Sharp",
  ...both({ radius: "0rem" }),
};

export const roundedPreset: Preset = {
  id: "rounded",
  label: "Rounded",
  ...both({ radius: "0.75rem" }),
};

export const pillPreset: Preset = {
  id: "pill",
  label: "Pill",
  ...both({ radius: "9999px" }),
};

export const builtInPresets: Preset[] = [
  defaultPreset,
  sharpPreset,
  roundedPreset,
  pillPreset,
];
