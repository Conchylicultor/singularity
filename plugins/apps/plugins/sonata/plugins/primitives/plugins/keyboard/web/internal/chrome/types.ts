import type { CSSProperties, ReactNode } from "react";
import type { SonataKeys } from "@plugins/apps/plugins/sonata/plugins/look/core";
import type { PitchKey } from "@plugins/apps/plugins/sonata/plugins/score/core";

/**
 * The contract between the keyboard primitive and the chrome that paints one
 * layout's keys.
 *
 * The split is deliberately lopsided. The PRIMITIVE renders every key element
 * and owns every invariant a layout must not be able to break — `data-pitch` on
 * each key, the paint order, the box, the lit lookup, the label host, the frame
 * and the pointer handlers. A CHROME only says what colour a key is. That is why
 * there is no "render a key" hook here and never should be: a chrome that could
 * mint its own element could drop `data-pitch`, and hit-testing (glissando,
 * multi-touch) would silently stop working on that layout alone.
 */

/**
 * The style a chrome may return — every CSS property EXCEPT the ones that move
 * or resize the box.
 *
 * The box belongs to the layout: a `PitchKey`'s center/width/top/height are what
 * put a falling note on its own key, and a chrome that could write `height` (as
 * the piano's black-key style used to, with a hardcoded `62%`) would be a second
 * source of truth for the same number. Here it is not a rule to remember — the
 * property has no spelling, so `tsc` rejects it at the chrome.
 *
 * `translate` is excluded too, because `<Placed>` writes it. `transform` is NOT:
 * the press displacement is a chrome decision, and the two compose (`translate`
 * is applied before `transform` by the spec).
 */
export type KeyChromeStyle = Omit<
  CSSProperties,
  | "position"
  | "inset"
  | "top"
  | "right"
  | "bottom"
  | "left"
  | "width"
  | "height"
  | "translate"
>;

/**
 * One lit key's colour, resolved ONCE by the primitive into both readings a
 * chrome may want:
 *  - `color` — the note's own colour, exactly as it fell.
 *  - `accidental` — that colour put through the caller's `accidentalColor` when
 *    the pitch is an accidental, and identical to `color` when it is not.
 *
 * Both, rather than the raw colour plus the function, so a chrome cannot forget
 * to ask whether the pitch is an accidental and cannot apply the darkening twice.
 * A skin that builds its own darkness from a gradient over near-black (realistic,
 * drawn) reads `color`; a skin where the key IS the fill (flat) reads
 * `accidental`.
 */
export interface LitKey {
  color: string;
  accidental: string;
}

/** What a chrome knows about a key beyond the key itself. */
export interface KeyPaintContext {
  /** The look's key palette — which of the three skins, and its colours if it
   *  draws its own. */
  skin: SonataKeys;
  /** This key's index within its own tier, ascending by pitch. The piano's flat
   *  skin needs it for the one white key that also draws its LEFT edge. */
  indexInTier: number;
}

/** What painting one key produces: its style, and any decoration that lives
 *  INSIDE the key box (the black key's front face). Children paint below the
 *  label, which the primitive appends after them. */
export interface KeyPaint {
  style: KeyChromeStyle;
  children?: ReactNode;
}

/**
 * One decorative layer painted BEFORE a tier's keys — the felt strip, the drawn
 * skin's SVG pass.
 *
 * It names a tier rather than an index so it lands in the paint order even when
 * that tier is EMPTY: the felt sits under the black keys, and a two-octave chip
 * whose window happens to hold no accidental must still show it.
 */
export interface ChromeDecor {
  id: string;
  tier: number;
  node: ReactNode;
}

/** The keys of one tier, ascending by pitch. */
export interface KeyTier {
  tier: number;
  keys: readonly PitchKey[];
}

export interface ChromeDecorContext {
  /** Every tier of the plane, ascending. The arrays are memoized on the plane,
   *  so a decor that renders per-key art (the drawn skin) may memoize on them. */
  tiers: readonly KeyTier[];
  skin: SonataKeys;
  /** Pitch → lit colour in the raw form the primitive normalises to (an empty
   *  string means the theme accent — see `litKeyColor`). */
  litColors: ReadonlyMap<number, string>;
}

/** Which label colour reads on a key at rest. Named for the SURFACE, not for the
 *  key: a jankó accidental and a piano black key are the same problem. */
export type LabelTone = "on-light" | "on-dark";

/**
 * How ONE pitch layout is painted. `tier` never reaches a chrome — it is the
 * primitive's paint order, not a fact about a key — so a chrome that wants to
 * know whether a key is black asks `isAccidental(key.pitch)`, which is true on
 * every layout.
 */
export interface KeyChrome {
  paintKey(
    key: PitchKey,
    lit: LitKey | undefined,
    ctx: KeyPaintContext,
  ): KeyPaint;
  /** Required, not optional: a layout with nothing to decorate returns a frozen
   *  empty array, so "no decor" is a stated answer rather than a missing method
   *  the primitive has to guess about. */
  decor(ctx: ChromeDecorContext): readonly ChromeDecor[];
  labelTone(key: PitchKey): LabelTone;
}

/** The answer for a layout that paints nothing between its keys. */
export const NO_DECOR: readonly ChromeDecor[] = Object.freeze([]);
