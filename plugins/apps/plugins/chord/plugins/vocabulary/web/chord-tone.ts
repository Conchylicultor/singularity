import type React from "react";
import type { ChordToken } from "@plugins/apps/plugins/chord/plugins/song-index/core";
import { chordDegree } from "@plugins/apps/plugins/chord/plugins/vocabulary/core";
import "./chord-paint.css";

/**
 * How deep each degree's solid tile is: the share of the chord colour kept
 * when it is mixed toward black in OKLCH (I … vii). The mockup's "solid" tiles:
 * each hue deepened until the light numeral on it reads, gold least of all.
 */
const TILE_DEPTH = ["76%", "70%", "76%", "72%", "74%", "76%", "72%"] as const;

/** A root outside the major scale: the theme's neutral chord grey. */
const OUTSIDE_SCALE = { colour: "var(--categorical-10)", depth: "74%" };

/**
 * The CSS custom properties that paint a chord: `--fn` (its degree's colour,
 * the theme's `categorical-1…7`, or `categorical-10` for a root outside the
 * major scale) and `--fn-depth` (how deep its tile is). `.chord-tone` in
 * `chord-paint.css` derives the tile fill and the numeral on it from these.
 */
export function chordToneStyle(token: ChordToken): React.CSSProperties {
  const degree = chordDegree(token);
  const tone =
    degree === null
      ? OUTSIDE_SCALE
      : {
          colour: `var(--categorical-${String(degree + 1)})`,
          depth: TILE_DEPTH[degree] ?? OUTSIDE_SCALE.depth,
        };
  return {
    "--fn": tone.colour,
    "--fn-depth": tone.depth,
  } as React.CSSProperties;
}
