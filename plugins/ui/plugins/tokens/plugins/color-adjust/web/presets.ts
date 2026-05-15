import type { ColorAdjustPresetContribution } from "./slots";

type Preset = ColorAdjustPresetContribution;

function preset(
  id: string,
  label: string,
  hueShift: number,
  saturationScale: number,
  lightnessScale: number,
): Preset {
  return { id, label, hueShift, saturationScale, lightnessScale };
}

export const builtInPresets: Preset[] = [
  preset("default", "Default", 0, 1, 1),
  preset("grayscale", "Grayscale", 0, 0, 1),
  preset("muted", "Muted", 0, 0.6, 1),
  preset("vibrant", "Vibrant", 0, 1.4, 1),
  preset("dimmer", "Dimmer", 0, 1, 0.8),
  preset("brighter", "Brighter", 0, 1, 1.2),
  preset("warm-shift", "Warm Shift", 30, 0.5, 0.95),
  preset("hue-60", "Hue +60", 60, 1, 1),
  preset("hue-neg-60", "Hue -60", -60, 1, 1),
  preset("hue-120", "Hue +120", 120, 1, 1),
  preset("hue-neg-120", "Hue -120", -120, 1, 1),
  preset("invert-hue", "Invert Hue", 180, 1, 1),
];
