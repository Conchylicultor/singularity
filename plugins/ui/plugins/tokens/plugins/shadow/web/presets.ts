import type { ShadowParams, ShadowTokenValues } from "../shared";
import { buildShadowTiers } from "../shared";

interface Preset {
  id: string;
  label: string;
  params: ShadowParams;
  light: ShadowTokenValues;
  dark: ShadowTokenValues;
}

function both(values: ShadowTokenValues): Pick<Preset, "light" | "dark"> {
  return { light: values, dark: values };
}

const defaultParams: ShadowParams = {
  color: "0 0 0",
  opacity: 0.1,
  blur: "3px",
  spread: "0px",
  offsetX: "0",
  offsetY: "1px",
};

const noneParams: ShadowParams = {
  color: "0 0 0",
  opacity: 0,
  blur: "0px",
  spread: "0px",
  offsetX: "0",
  offsetY: "0px",
};

const elevatedParams: ShadowParams = {
  color: "0 0 0",
  opacity: 0.15,
  blur: "8px",
  spread: "1px",
  offsetX: "0",
  offsetY: "4px",
};

const heavyParams: ShadowParams = {
  color: "0 0 0",
  opacity: 0.25,
  blur: "20px",
  spread: "4px",
  offsetX: "0",
  offsetY: "8px",
};

export const defaultPreset: Preset = {
  id: "default",
  label: "Default",
  params: defaultParams,
  ...both(buildShadowTiers(defaultParams)),
};

export const nonePreset: Preset = {
  id: "none",
  label: "None",
  params: noneParams,
  ...both(buildShadowTiers(noneParams)),
};

export const elevatedPreset: Preset = {
  id: "elevated",
  label: "Elevated",
  params: elevatedParams,
  ...both(buildShadowTiers(elevatedParams)),
};

export const heavyPreset: Preset = {
  id: "heavy",
  label: "Heavy",
  params: heavyParams,
  ...both(buildShadowTiers(heavyParams)),
};

export const builtInPresets: Preset[] = [
  defaultPreset,
  nonePreset,
  elevatedPreset,
  heavyPreset,
];
