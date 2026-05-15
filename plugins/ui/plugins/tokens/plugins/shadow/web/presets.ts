import type { ShadowTokenValues } from "../shared";
import { buildShadowTiers } from "../shared";

interface Preset {
  id: string;
  label: string;
  light: ShadowTokenValues;
  dark: ShadowTokenValues;
}

function both(values: ShadowTokenValues): Pick<Preset, "light" | "dark"> {
  return { light: values, dark: values };
}

export const defaultPreset: Preset = {
  id: "default",
  label: "Default",
  ...both(
    buildShadowTiers({
      color: "0 0 0",
      opacity: 0.1,
      blur: "3px",
      spread: "0px",
      offsetX: "0",
      offsetY: "1px",
    }),
  ),
};

export const nonePreset: Preset = {
  id: "none",
  label: "None",
  ...both(
    buildShadowTiers({
      color: "0 0 0",
      opacity: 0,
      blur: "0px",
      spread: "0px",
      offsetX: "0",
      offsetY: "0px",
    }),
  ),
};

export const elevatedPreset: Preset = {
  id: "elevated",
  label: "Elevated",
  ...both(
    buildShadowTiers({
      color: "0 0 0",
      opacity: 0.15,
      blur: "8px",
      spread: "1px",
      offsetX: "0",
      offsetY: "4px",
    }),
  ),
};

export const heavyPreset: Preset = {
  id: "heavy",
  label: "Heavy",
  ...both(
    buildShadowTiers({
      color: "0 0 0",
      opacity: 0.25,
      blur: "20px",
      spread: "4px",
      offsetX: "0",
      offsetY: "8px",
    }),
  ),
};

export const builtInPresets: Preset[] = [
  defaultPreset,
  nonePreset,
  elevatedPreset,
  heavyPreset,
];
