import { type CSSProperties, type ReactNode, useMemo } from "react";
import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { type KeyLane, keyLayout } from "./key-layout";

/**
 * Key colors. A piano is a physical object — white keys are always ivory,
 * black keys always near-black, the keybed felt always deep red — so every
 * surface color here stays fixed in both light and dark themes rather than
 * tracking the UI's foreground/background tokens (which flip in dark mode and
 * would invert the keys). The lit state tints the key with the theme's accent
 * (`var(--primary)`) or a caller-supplied color via `color-mix()`, layered
 * over the fixed key chrome. Inline styles keep all of this out of the
 * className-only `no-hardcoded-colors` check (the sanctioned escape hatch for
 * physical-object colors).
 *
 * Realism is pure CSS — gradients + box-shadows only, expressed in percentages
 * and 1–2px values so the same chrome scales from an `h-11` readout chip to
 * the full 88-key roll gutter. Layers, back to front: white keys → red felt
 * strip → black keys. A lit key reads as PRESSED: `translateY(1px)` (the
 * bottom pixel clips under the keybed), a compressed front edge, a color tint
 * concentrated at the key TOP (where falling notes land), and a soft glow.
 */

/** Shared press transition — fast enough to track per-frame note onsets. */
const PRESS_TRANSITION = "transform 80ms ease-out, box-shadow 80ms ease-out";

/**
 * Fixed bottom-corner radius for the keys. A piano key's front lip is only
 * barely eased on a real instrument — far squarer than the UI's `--radius`
 * shape token. Like the fixed key colors above, this is a physical-object
 * shape that must NOT track the app's shape preset (a "Pill" theme should not
 * round piano keys into lozenges), so it lives in an inline style rather than a
 * `rounded-*` token class. The keys' top edge stays square (it tucks under the
 * felt/fallboard).
 */
const KEY_BOTTOM_RADIUS: CSSProperties = {
  borderBottomLeftRadius: "3.5px",
  borderBottomRightRadius: "3.5px",
};

/** `color` at `pct`% opacity, for tint/glow layers over the key chrome. */
const mix = (color: string, pct: number) =>
  `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/**
 * Red felt strip at the top of the keybed — the dampening felt visible where
 * the keys meet the fallboard on a real piano.
 */
const FELT: CSSProperties = {
  height: "2px",
  background: "linear-gradient(to bottom, #5e1620, #7a1f2b)",
  boxShadow: "0 1px 1px rgba(0, 0, 0, 0.25)",
};

/**
 * White key: ivory sheen from the top, with the last ~8% darkening into the
 * rounded front edge (the lip facing the player). Inset shadows carve the
 * inter-key groove (right edge), a soft left-edge highlight, and the bottom
 * lip. When lit, the front-edge gradient stops compress (88/94 → 91/97) so
 * less of the lip is visible — the depression read — and a tint gradient
 * (strong at the top, still saturated enough at the bottom for label
 * contrast) layers over the ivory. The leading zero-size outer shadow at rest
 * keeps the shadow lists structurally parallel so the glow interpolates
 * instead of jumping.
 */
const WHITE_REST_BG =
  "linear-gradient(to bottom, #fdfdfa, #f7f6f1 55%, #efeee8 88%, #dddcd4 94%, #cfcec6)";
const WHITE_PRESSED_BG =
  "linear-gradient(to bottom, #fdfdfa, #f7f6f1 55%, #efeee8 91%, #dddcd4 97%, #cfcec6)";
const WHITE_CARVE =
  "inset -1px 0 0 #d9d8d0, inset 1px 0 0 rgba(255, 255, 255, 0.6), inset 0 -1px 1px rgba(0, 0, 0, 0.12)";

function whiteKeyStyle(litColor: string | undefined): CSSProperties {
  if (litColor === undefined) {
    return {
      background: WHITE_REST_BG,
      boxShadow: `0 0 0 0 rgba(0, 0, 0, 0), ${WHITE_CARVE}`,
      transition: PRESS_TRANSITION,
    };
  }
  const tint = `linear-gradient(to bottom, ${mix(litColor, 90)}, ${mix(litColor, 70)} 55%, ${mix(litColor, 55)})`;
  return {
    background: `${tint}, ${WHITE_PRESSED_BG}`,
    boxShadow: `0 0 6px 1px ${mix(litColor, 35)}, ${WHITE_CARVE}`,
    transform: "translateY(1px)",
    transition: PRESS_TRANSITION,
  };
}

/**
 * Black key: glossy cap catching light at the far (top) end, side bevels via
 * inset shadows (left highlight, right shade), and a small drop shadow cast
 * onto the white keys below. The vertical front face of the key is a separate
 * absolutely-positioned div (see `BLACK_FACE`). When lit, the cap is tinted
 * via `color-mix` over the gloss and the key gains the same press + glow.
 */
const BLACK_REST_BG =
  "linear-gradient(to bottom, #4a4a4a, #222222 18%, #161616 70%, #060606)";
const BLACK_CARVE =
  "inset 1px 0 0 rgba(255, 255, 255, 0.10), inset -1px 0 0 rgba(0, 0, 0, 0.70), inset 0 1px 0 rgba(255, 255, 255, 0.08)";
const BLACK_DROP = "0 2px 3px rgba(0, 0, 0, 0.45)";

function blackKeyStyle(litColor: string | undefined): CSSProperties {
  const base: CSSProperties = { height: "62%", transition: PRESS_TRANSITION };
  if (litColor === undefined) {
    return {
      ...base,
      background: BLACK_REST_BG,
      boxShadow: `0 0 0 0 rgba(0, 0, 0, 0), ${BLACK_DROP}, ${BLACK_CARVE}`,
    };
  }
  return {
    ...base,
    background: `linear-gradient(to bottom, color-mix(in srgb, ${litColor} 72%, #3f3f3f), color-mix(in srgb, ${litColor} 60%, #161616) 35%, color-mix(in srgb, ${litColor} 48%, #060606))`,
    boxShadow: `0 0 6px 1px ${mix(litColor, 45)}, ${BLACK_DROP}, ${BLACK_CARVE}`,
    transform: "translateY(1px)",
    transition: PRESS_TRANSITION,
  };
}

/**
 * The black key's vertical front face — the surface facing the player at the
 * key's bottom (near) end. Absolutely positioned so it never displaces
 * `renderKey` children, and at `z-index: -1` so it paints above the key's own
 * cap background but BEHIND the in-flow label (the `z-raised` black key is a
 * stacking context, so -1 stays inside the key). Pressing shortens the face
 * (14% → 8%): the key tilts forward and less of the face is visible. When lit,
 * the face continues the cap's tinted bottom color (picking up where the cap's
 * bottom gradient stop leaves off) and darkens toward the near edge — without
 * this the face stayed near-black and read as an uncolored band under a lit
 * cap.
 */
const BLACK_FACE = (litColor: string | undefined): CSSProperties => ({
  height: litColor === undefined ? "14%" : "8%",
  zIndex: -1,
  background:
    litColor === undefined
      ? "linear-gradient(to bottom, #2e2e2e, #000000)"
      : `linear-gradient(to bottom, color-mix(in srgb, ${litColor} 48%, #060606), color-mix(in srgb, ${litColor} 28%, #000000))`,
  transition: "height 80ms ease-out, background 80ms ease-out",
});

/**
 * Which keys are highlighted and how:
 *  - array form: each listed pitch lights in the theme accent (`var(--primary)`).
 *  - map form: each pitch lights in its mapped CSS color (e.g. per-track
 *    colors); an empty-string value falls back to the accent.
 */
export type KeyHighlight = ReadonlyArray<number> | ReadonlyMap<number, string>;

export interface KeyboardProps {
  /** Lowest MIDI pitch to render (inclusive). Use a C for a flush left edge. */
  low: number;
  /** Highest MIDI pitch to render (inclusive). Use a B for a flush right edge. */
  high: number;
  /** Pitches to highlight (e.g. a chord voicing or the keys sounding now). */
  lit: KeyHighlight;
  /**
   * Optional content drawn inside each key, bottom-centered (e.g. a note
   * label). Receives the key and whether it is currently lit, so the caller
   * owns all content styling.
   */
  renderKey?: (key: KeyLane, lit: boolean) => ReactNode;
  className?: string;
}

/**
 * Stateless piano keyboard: the single source of truth for how a piano key is
 * laid out and drawn. Renders the keys in `[low, high]` and lights the `lit`
 * pitches; knows nothing about chords, scores, or playback — the caller supplies
 * the range, which pitches to light (and in what color), and any per-key
 * content. The full projection-driven `PianoKeyboard` and the chord readout both
 * compose this. Height is set by the caller via `className` (e.g. `h-16`); keys
 * fill it.
 */
export function Keyboard({ low, high, lit, renderKey, className }: KeyboardProps) {
  const lanes = useMemo(() => keyLayout(low, high), [low, high]);

  // Normalize both highlight forms to a pitch → color lookup. A present entry
  // with an empty string means "lit in the theme accent"; a non-empty value is
  // an explicit CSS color; an absent pitch is at rest.
  const litColors = useMemo<ReadonlyMap<number, string>>(() => {
    if ("get" in lit) return lit; // already a pitch → color map
    const m = new Map<number, string>();
    for (const pitch of lit) m.set(pitch, "");
    return m;
  }, [lit]);

  const whites = lanes.filter((k) => !k.isBlack);
  const blacks = lanes.filter((k) => k.isBlack);

  const renderLane = (k: KeyLane) => {
    const raw = litColors.get(k.pitch); // undefined → rest, "" → accent, else color
    const isLit = raw !== undefined;
    // One inline-style path for both highlight forms: the accent is just an
    // explicit color of `var(--primary)`.
    const litColor = raw === undefined ? undefined : raw || "var(--primary)";
    return (
      <div
        key={k.pitch}
        className={cn(
          "absolute flex items-end justify-center",
          k.isBlack ? "top-0 z-raised" : "bottom-0 top-0",
        )}
        style={{
          left: `${(k.center - k.width / 2) * 100}%`,
          width: `${k.width * 100}%`,
          ...KEY_BOTTOM_RADIUS,
          ...(k.isBlack ? blackKeyStyle(litColor) : whiteKeyStyle(litColor)),
        }}
      >
        {k.isBlack && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0"
            style={{ ...BLACK_FACE(litColor), ...KEY_BOTTOM_RADIUS }}
          />
        )}
        {renderKey?.(k, isLit)}
      </div>
    );
  };

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      // Physical keyboard frame — fixed shape, preset-independent (see
      // KEY_BOTTOM_RADIUS). overflow-hidden would otherwise clip the corner
      // keys to a theme-token radius.
      style={{ borderRadius: "4px" }}
    >
      {/* White keys (back layer). */}
      {whites.map(renderLane)}
      {/* Red felt strip across the keybed top — above whites, below blacks. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0" style={FELT} />
      {/* Black keys (front layer), ~62% height. */}
      {blacks.map(renderLane)}
    </div>
  );
}
