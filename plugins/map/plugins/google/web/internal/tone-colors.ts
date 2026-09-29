import { useMemo } from "react";
import {
  MAP_TONE_TOKEN,
  type MapOverlay,
  type MapTone,
} from "@plugins/map/core";

export const DEFAULT_TONE: MapTone = "primary";

export type ToneColors = Partial<Record<MapTone, string>>;

/**
 * Google's polylines and polygons take a colour STRING, not a CSS variable, so a
 * tone has to be resolved to a concrete colour where the map is painted.
 *
 * Resolved against the map's own element (a theme scope can sit between it and
 * `:root`), then normalised to `rgb()` through a 1×1 canvas: a theme token may
 * be `oklch(…)`, which the computed style reports verbatim and Google's stroke
 * parser need not understand.
 */
function resolveTone(host: HTMLElement, tone: MapTone): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${MAP_TONE_TOKEN[tone]})`;
  host.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("map: no 2d canvas to resolve a tone");
  ctx.fillStyle = computed;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${r}, ${g}, ${b})`;
}

function tonesOf(overlays: readonly MapOverlay[]): MapTone[] {
  const tones = new Set<MapTone>();
  for (const o of overlays) {
    if (o.kind !== "pin") tones.add(o.style?.tone ?? DEFAULT_TONE);
  }
  return [...tones].sort();
}

/**
 * The concrete colour of every tone the stroked overlays use. Empty until the
 * host element has mounted — a stroke is drawn only once its colour is known,
 * never in a guessed one. Re-resolved when the set of tones changes (not on a
 * theme switch: that re-paints on the next overlay change or remount).
 *
 * Takes the element itself (held in state by the caller), so the read is a
 * memo of committed DOM rather than a ref read or an effect that sets state.
 */
export function useToneColors(
  host: HTMLElement | null,
  overlays: readonly MapOverlay[],
): ToneColors {
  const key = tonesOf(overlays).join(",");
  return useMemo(() => {
    const colors: ToneColors = {};
    if (host === null || key === "") return colors;
    for (const tone of key.split(",") as MapTone[]) {
      colors[tone] = resolveTone(host, tone);
    }
    return colors;
  }, [host, key]);
}
