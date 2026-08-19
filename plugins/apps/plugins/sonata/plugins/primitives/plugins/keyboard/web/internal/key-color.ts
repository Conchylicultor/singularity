/**
 * The two colour rules every key skin shares, in one place so the CSS-drawn
 * skins (flat / realistic) and the SVG-drawn one cannot drift apart on either.
 *
 * They live here rather than in `keyboard.tsx` only because `sketch-skin.tsx`
 * needs them too, and importing back into `keyboard.tsx` would be a cycle.
 */

/** `color` at `pct`% opacity, for tint/glow layers over the key chrome. */
export const mix = (color: string, pct: number) =>
  `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/**
 * Resolve one entry of the `lit` lookup into the colour a key is lit in:
 * absent → at rest, empty string → the theme accent, anything else → itself.
 * One path for both highlight forms — the accent is just an explicit colour of
 * `var(--primary)`.
 */
export function litKeyColor(raw: string | undefined): string | undefined {
  return raw === undefined ? undefined : raw || "var(--primary)";
}
