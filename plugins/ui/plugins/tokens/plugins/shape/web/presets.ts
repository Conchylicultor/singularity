import type { ShapeTokenValues } from "../shared";

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
  ...both({ radius: "0.625rem", spacing: "0.25rem" }),
};

export const sharpPreset: Preset = {
  id: "sharp",
  label: "Sharp",
  ...both({ radius: "0rem", spacing: "0.25rem" }),
};

export const roundedPreset: Preset = {
  id: "rounded",
  label: "Rounded",
  ...both({ radius: "0.75rem", spacing: "0.25rem" }),
};

export const pillPreset: Preset = {
  id: "pill",
  label: "Pill",
  ...both({ radius: "9999px", spacing: "0.25rem" }),
};

export const builtInPresets: Preset[] = [
  defaultPreset,
  sharpPreset,
  roundedPreset,
  pillPreset,
];
