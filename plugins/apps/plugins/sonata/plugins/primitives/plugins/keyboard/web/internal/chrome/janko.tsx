import {
  isAccidental,
  type PitchKey,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { mix } from "../key-color";
import {
  NO_DECOR,
  type KeyChrome,
  type KeyChromeStyle,
  type KeyPaint,
  type KeyPaintContext,
  type LitKey,
} from "./types";

/**
 * The Jankó chrome — uniform pads in rows, one colour rule and no decor.
 *
 * WHY `isAccidental` AND NOT ROW PARITY. A Jankó row mixes naturals and
 * accidentals (the near row is C D E F♯ G♯ A♯), so colouring by row would put a
 * dark falling note on a light pad and vice versa. Ivory for naturals, ebony for
 * accidentals carries the piano's reading across unchanged: a note lands on a
 * pad the same shade the note itself fell in.
 *
 * WHY C IS MARKED. Every octave of an isomorphic keyboard looks identical — the
 * pattern that lets you find middle C on a piano does not exist here. Each C pad
 * carries a 2px bar down its left edge, the same orientation cue the roll's
 * strong guide gives at the same column.
 *
 * WHY THE GAP IS A RING. The pads read as separate objects, but a margin between
 * them would leave a dead strip where a glissando drag lands on nothing. The gap
 * is an INSET ring in the keybed's own colour, so the hit targets still tile edge
 * to edge (the same technique the piano's flat white keys use for their
 * separators).
 *
 * `paintKey` runs once per pad per render — 176 of them on a full-range Jankó,
 * on every note-on — so everything here is a template string over module
 * constants. No object spreads per key, no arrays built to be joined.
 */

/** Radius on all four corners: a Jankó pad is a free-standing button, not a key
 *  whose far end tucks under a fallboard. Inline (like the piano's front-lip
 *  radius) because it is a physical-object shape that must not track the app's
 *  `--radius` preset. */
const RADIUS = "3px";

/** The keybed showing between pads. Slightly lighter than the ebony fill, so the
 *  gap reads as a groove on a dark pad and as a border on a light one. */
const GAP = "#3f3f46";

/* Flat: solid fills, matching the piano's flat naturals/accidentals so the two
   layouts read as the same instrument in the same look. */
const FLAT_IVORY = "#fafafa";
const FLAT_EBONY = "#1a1a1a";

/* Realistic: the pad catches light at its far (top) end and shades toward the
   player, which is the whole of its relief — a pad has no front face to bevel. */
const REAL_IVORY = "linear-gradient(to bottom, #fdfdfa, #f4f3ee 60%, #e2e1d9)";
const REAL_EBONY = "linear-gradient(to bottom, #3d3d3d, #1d1d1d 55%, #0b0b0b)";
/** Top-light sheen laid over whichever fill is underneath. */
const TOP_LIGHT =
  "linear-gradient(to bottom, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0) 42%)";

/** The C orientation bar, in a graphite that reads on ivory — C is pitch class
 *  0, always a natural, so it is only ever drawn on a light pad. */
const MARK = "#8a8a93";

/** Shared press transition — fast enough to track per-frame note onsets. */
const PRESS_TRANSITION = "transform 80ms ease-out, box-shadow 80ms ease-out";

/** True on the pads that carry the orientation mark. */
function isC(pitch: number): boolean {
  return ((pitch % 12) + 12) % 12 === 0;
}

/**
 * The inset shadow list for one pad: the 1px keybed ring, the C bar over it when
 * this is a C, and an outer glow when lit. The mark comes FIRST so it paints on
 * top of the ring rather than being clipped to a 1px sliver by it.
 */
function pads(ring: string, c: boolean, glow: string | null): string {
  const mark = c ? `inset 2px 0 0 ${MARK}, ` : "";
  const ringShadow = `inset 0 0 0 1px ${ring}`;
  return glow === null
    ? `${mark}${ringShadow}`
    : `${glow}, ${mark}${ringShadow}`;
}

export const jankoChrome: KeyChrome = {
  paintKey(
    key: PitchKey,
    lit: LitKey | undefined,
    ctx: KeyPaintContext,
  ): KeyPaint {
    const accidental = isAccidental(key.pitch);
    // The lit fill is the note's own colour, darkened on an accidental exactly as
    // the falling note is — so a pad and the note that lands on it never disagree.
    const litColor =
      lit === undefined ? undefined : accidental ? lit.accidental : lit.color;
    const c = isC(key.pitch);
    const skin = ctx.skin;

    if (skin.skin === "flat") {
      return {
        style: {
          borderRadius: RADIUS,
          background: litColor ?? (accidental ? FLAT_EBONY : FLAT_IVORY),
          boxShadow: pads(GAP, c, null),
          transition: PRESS_TRANSITION,
        },
      };
    }

    if (skin.skin === "drawn") {
      // No SVG pass under Jankó: a hand-drawn pad has nothing a wobbling outline
      // would add that the ink ring does not already say. The look still speaks —
      // the fills and the ring are its own palette, so the pads sit on the paper
      // lane instead of floating over it as an unrelated dark grid.
      return {
        style: {
          borderRadius: RADIUS,
          background: litColor ?? (accidental ? skin.ebony : skin.ivory),
          boxShadow: pads(skin.ink, c, null),
          transition: PRESS_TRANSITION,
        },
      };
    }

    // Realistic: the same pads with a top-light sheen, plus the piano's press —
    // the pad drops a pixel and glows in its own colour.
    const base = accidental ? REAL_EBONY : REAL_IVORY;
    if (litColor === undefined) {
      return {
        style: {
          borderRadius: RADIUS,
          background: `${TOP_LIGHT}, ${base}`,
          // The zero-size leading shadow keeps the rest and lit lists
          // structurally parallel, so the glow interpolates instead of jumping.
          boxShadow: pads(GAP, c, "0 0 0 0 rgba(0, 0, 0, 0)"),
          transition: PRESS_TRANSITION,
        },
      };
    }
    return {
      style: {
        borderRadius: RADIUS,
        background: `${TOP_LIGHT}, linear-gradient(to bottom, ${mix(litColor, 92)}, ${mix(litColor, 66)}), ${base}`,
        boxShadow: pads(GAP, c, `0 0 6px 1px ${mix(litColor, 40)}`),
        transform: "translateY(1px)",
        transition: PRESS_TRANSITION,
      } satisfies KeyChromeStyle,
    };
  },

  // Nothing between the pads: no felt (there is no fallboard to damp against)
  // and no drawn pass. A frozen constant rather than a fresh `[]`, since this
  // runs on every render.
  decor() {
    return NO_DECOR;
  },

  labelTone(key) {
    return isAccidental(key.pitch) ? "on-dark" : "on-light";
  },
};
