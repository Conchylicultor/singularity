import type { ColorAdjustment } from "@plugins/ui/plugins/theme-engine/core";

/** "Fill from…" shortcuts for a theme's color adjustment: whole adjustments, not settings. */
export const colorAdjustShortcuts: {
  id: string;
  label: string;
  adjustment: ColorAdjustment;
}[] = [
  shortcut("default", "Default", 0, 1, 1),
  shortcut("grayscale", "Grayscale", 0, 0, 1),
  shortcut("muted", "Muted", 0, 0.6, 1),
  shortcut("vibrant", "Vibrant", 0, 1.4, 1),
  shortcut("dimmer", "Dimmer", 0, 1, 0.8),
  shortcut("brighter", "Brighter", 0, 1, 1.2),
  shortcut("warm-shift", "Warm Shift", 30, 0.5, 0.95),
  shortcut("hue-60", "Hue +60", 60, 1, 1),
  shortcut("hue-neg-60", "Hue -60", -60, 1, 1),
  shortcut("hue-120", "Hue +120", 120, 1, 1),
  shortcut("hue-neg-120", "Hue -120", -120, 1, 1),
  shortcut("invert-hue", "Invert Hue", 180, 1, 1),
];

function shortcut(
  id: string,
  label: string,
  hueShift: number,
  saturationScale: number,
  lightnessScale: number,
) {
  return {
    id,
    label,
    adjustment: { hueShift, saturationScale, lightnessScale },
  };
}
