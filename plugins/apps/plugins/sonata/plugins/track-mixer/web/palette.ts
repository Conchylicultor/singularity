/**
 * Synthesia track palette. Each track has TWO coordinated colors — a brighter
 * shade for notes on white keys (naturals) and a darker, slightly more
 * saturated shade for notes on black keys (sharps/flats) — exactly as Synthesia
 * draws them. The white-key shade is the track's "base" color (the swatch shown
 * in the mixer and the color the keyboard lights with); the black-key shade is
 * its partner, applied per-note by the piano-roll renderer via
 * {@link blackKeyColor}.
 *
 * The first two entries are sampled pixel-exact from Synthesia (blue + green —
 * its default right/left-hand colors); the rest extend the set in the same
 * vivid-but-soft register, their black-key partners derived by the shared
 * darken+saturate transform so every track keeps the natural/sharp distinction.
 *
 * Tracks default to a color by their index in `score.tracks`; the user can
 * override the base per track (the override flows through `blackKeyColor` the
 * same way). Cycles if a score has more tracks than colors.
 */

/** White-key (base) color per palette slot. */
export const TRACK_PALETTE = [
  "#87aacf", // 1 — Synthesia blue
  "#a2e55b", // 2 — Synthesia green
  "#cf87c4", // 3 — magenta
  "#e5b15b", // 4 — amber
  "#5bd2cf", // 5 — cyan
  "#e58787", // 6 — rose
  "#9b87cf", // 7 — violet
  "#b6cf5b", // 8 — lime
  "#5b9be5", // 9 — azure
  "#e5cf5b", // 10 — gold
] as const;

/**
 * Exact black-key partners for the colors Synthesia ships (sampled from its
 * render). Other base colors fall through to {@link deriveBlackKey}.
 */
const EXACT_BLACK_KEY: Record<string, string> = {
  "#87aacf": "#376bae", // blue
  "#a2e55b": "#569d10", // green
};

/** The default (white-key/base) color for the track at `index`. */
export function defaultTrackColor(index: number): string {
  return TRACK_PALETTE[index % TRACK_PALETTE.length]!;
}

/**
 * The black-key (sharp/flat) shade for a given base color — Synthesia's
 * natural-vs-accidental distinction. Returns the sampled-exact partner for the
 * built-in Synthesia colors, and otherwise darkens + slightly saturates the
 * base (the relationship the exact pairs share). Non-hex inputs (e.g. the
 * `var(--primary)` no-track fallback) are returned unchanged.
 */
export function blackKeyColor(base: string): string {
  const key = base.trim().toLowerCase();
  return EXACT_BLACK_KEY[key] ?? deriveBlackKey(key);
}

// --- color math ----------------------------------------------------------------

function deriveBlackKey(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex; // not a #rrggbb literal — leave as-is (white === black)
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  // Black keys read darker and a touch more saturated than their white-key twin.
  const [r, g, b] = hslToRgb(h, Math.min(1, s + 0.09), l * 0.6);
  return rgbToHex(r, g, b);
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  const ch = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = (((g - b) / d) % 6 + 6) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb: [number, number, number];
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return [(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255];
}
