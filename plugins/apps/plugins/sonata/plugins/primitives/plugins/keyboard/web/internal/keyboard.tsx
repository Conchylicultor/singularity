import { type CSSProperties, type ReactNode, useMemo } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { useConfig } from "@plugins/config_v2/web";
import {
  asSonataLook,
  SONATA_LOOK_STYLES,
  type SonataKeys,
  sonataLookConfig,
} from "@plugins/apps/plugins/sonata/plugins/look/core";
import { litKeyColor, mix } from "./key-color";
import { BLACK_KEY_HEIGHT_PCT, type KeyLane, keyLayout } from "./key-layout";
import { SketchKeys } from "./sketch-skin";
import {
  usePlayableKeyboard,
  type KeyboardInteraction,
} from "./use-playable-keyboard";

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
 * THREE skins, applied to EVERY keyboard render (full roll + readout chips),
 * and all three come from ONE switch — Sonata's look:
 *  - `realistic` — skeuomorphic ivory/ebony: gradients + box-shadow bevels, a
 *    pressed-key depression, and a lit key tinted (translucent) over the ivory.
 *  - `flat` — Synthesia-style: solid fills, no gloss/gradients, strong dark
 *    white-key borders, and a lit key painted in the note's ACTUAL color (the
 *    same color it fell in — no translucent tint washing it out).
 *  - `drawn` — the sketch look's hand-drawn keys, an SVG layer
 *    (`sketch-skin.tsx`); here it only means the key divs go transparent and the
 *    felt strip stands down.
 *
 * There is no second axis to reconcile. The keys used to have their own
 * flat/realistic config alongside the look, but the drawn look never consulted
 * it — paper lane under glossy ivory keys is not a combination worth reaching —
 * so the pair was really one three-valued choice wearing two controls. The skin
 * is now read straight off the look's palette, which is why the unwanted
 * combination has no spelling rather than a rule that suppresses it.
 *
 * Realism (realistic variant) is pure CSS — gradients + box-shadows only,
 * expressed in percentages and 1–2px values so the same chrome scales from an
 * `h-11` readout chip to the full 88-key roll gutter. Layers, back to front:
 * white keys → red felt strip → black keys.
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

/**
 * Red felt strip at the top of the keybed — the dampening felt visible where
 * the keys meet the fallboard on a real piano. Flat keeps the line as a solid
 * red bar (Synthesia shows the same strike line) without the gloss shadow.
 */
const FELT_REALISTIC: CSSProperties = {
  height: "2px",
  background: "linear-gradient(to bottom, #5e1620, #7a1f2b)",
  boxShadow: "0 1px 1px rgba(0, 0, 0, 0.25)",
};
const FELT_FLAT: CSSProperties = { height: "2px", background: "#7a1f2b" };
const feltStyle = (style: Exclude<KeySkin, "drawn">): CSSProperties =>
  style === "flat" ? FELT_FLAT : FELT_REALISTIC;

/**
 * Which skin draws the keys — the look's own three-member choice, aliased here
 * so every per-key style function has to answer for all of them and `tsc` says
 * so if a fourth look introduces a new one.
 */
type KeySkin = SonataKeys["skin"];

/**
 * Under the drawn skin the key div holds no chrome at all: `sketch-skin.tsx`
 * paints the key as a path beneath it, and the div stays purely as the
 * `data-pitch` hit target and the host for `renderKey` labels. Transparent, not
 * absent — removing it would take glissando and multi-touch with it.
 */
const DRAWN_CHROME: CSSProperties = { background: "transparent" };

/* ---- Realistic variant -------------------------------------------------- */

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

/* ---- Flat (Synthesia) variant ------------------------------------------- *
 * Solid fills only — no gradients, gloss, or pressed depression. White keys
 * get a strong dark border on every edge (the inter-key separators read as
 * crisp dark lines, the front lip slightly darker). A lit key is painted in
 * the note's actual color, so the key matches the falling note exactly with no
 * translucent tint over ivory. */
const FLAT_WHITE_BG = "#fafafa";
const FLAT_WHITE_BORDER = "#52525b"; // inter-key separators (dark, strong)
const FLAT_WHITE_LIP = "#3f3f46"; // front bottom lip — slightly darker
const FLAT_BLACK_BG = "#1a1a1a";

/**
 * Flat white-key borders, drawn with inset box-shadows so they never shift
 * layout. Every key carries its right separator and bottom lip; only the
 * leftmost key adds a left edge (adjacent keys would otherwise double the line
 * between them), which also closes the keyboard's outer-left border.
 */
function flatWhiteCarve(isFirst: boolean): string {
  const edges = [
    `inset -1px 0 0 ${FLAT_WHITE_BORDER}`,
    `inset 0 -2px 0 ${FLAT_WHITE_LIP}`,
  ];
  if (isFirst) edges.push(`inset 1px 0 0 ${FLAT_WHITE_BORDER}`);
  return edges.join(", ");
}

function whiteKeyStyle(
  litColor: string | undefined,
  style: KeySkin,
  isFirst: boolean,
): CSSProperties {
  if (style === "drawn") return DRAWN_CHROME;
  if (style === "flat") {
    return {
      background: litColor ?? FLAT_WHITE_BG,
      boxShadow: flatWhiteCarve(isFirst),
      transition: PRESS_TRANSITION,
    };
  }
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

function blackKeyStyle(
  litColor: string | undefined,
  style: KeySkin,
): CSSProperties {
  // The height is the ONE thing the drawn skin still needs from here: it is what
  // makes the transparent hit target the same shape as the path drawn under it.
  const base: CSSProperties = {
    height: `${BLACK_KEY_HEIGHT_PCT}%`,
    transition: PRESS_TRANSITION,
  };
  if (style === "drawn") return { ...base, ...DRAWN_CHROME };
  if (style === "flat") {
    return { ...base, background: litColor ?? FLAT_BLACK_BG };
  }
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
 * key's bottom (near) end. REALISTIC ONLY: it's a skeuomorphic depth cue (a
 * lighter lip that shortens 14% → 8% on press for the forward-tilt read). The
 * flat / Synthesia style draws each black key as a single uniform solid block
 * (see the `style === "realistic"` guard on the render site), so it gets no
 * face — a darker foot band would read as an artifact against the flat fill.
 * Absolutely positioned so it never displaces `renderKey` children, and at
 * `z-index: -1` so it paints above the key's own cap background but BEHIND the
 * in-flow label (the `z-raised` black key is a stacking context, so -1 stays
 * inside the key).
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
  /**
   * Derives the color a lit BLACK key shows from its base lit color — Synthesia
   * draws accidentals a shade darker than naturals, so a lit black key is darker
   * than a lit white key of the same track. Injected (rather than imported) to
   * keep this primitive dependency-free: the caller owns the actual palette
   * relationship (the same `blackKeyColor` the falling notes use), so the key and
   * the note that lands on it stay in lockstep. Applied only in the `flat` style;
   * `realistic` derives its own darkness from the gradient over near-black, so it
   * takes the base color to avoid compounding. Defaults to identity.
   */
  accidentalColor?: (base: string) => string;
  /**
   * Opt-in playability: when present the keyboard becomes interactive — clicking,
   * tapping, or dragging across keys fires `onPress` / `onRelease` (per pitch,
   * multi-touch + glissando aware). Omitted, the keyboard stays a pure display
   * (the chord/key readouts), with no pointer handlers attached.
   */
  interaction?: KeyboardInteraction;
  className?: string;
}

/**
 * Stateless piano keyboard: the single source of truth for how a piano key is
 * laid out and drawn. Renders the keys in `[low, high]` and lights the `lit`
 * pitches; knows nothing about chords, scores, or playback — the caller supplies
 * the range, which pitches to light (and in what color), and any per-key
 * content. The full projection-driven `PianoKeyboard` and the chord readout both
 * compose this. The skin is read from config so the choice applies everywhere a
 * keyboard renders: Sonata's look decides first (its palette either draws the
 * keys or does not), and only when it does not is the keyboard's own flat /
 * realistic style consulted. Height is set by the caller via `className` (e.g.
 * `h-16`); keys fill it.
 */
export function Keyboard({
  low,
  high,
  lit,
  renderKey,
  accidentalColor = (c) => c,
  interaction,
  className,
}: KeyboardProps) {
  const { look } = useConfig(sonataLookConfig);
  // One read, one skin. `keys` stays in hand (rather than just `keys.skin`) so
  // the drawn arm's palette is reached by narrowing the union below, never by
  // asserting that a look which draws must have brought colours with it.
  const keys = SONATA_LOOK_STYLES[asSonataLook(look)].keys;
  const style: KeySkin = keys.skin;
  const lanes = useMemo(() => keyLayout(low, high), [low, high]);
  // Pointer handlers when playable; `{}` (no listeners) otherwise.
  const playProps = usePlayableKeyboard(interaction);

  // Normalize both highlight forms to a pitch → color lookup. A present entry
  // with an empty string means "lit in the theme accent"; a non-empty value is
  // an explicit CSS color; an absent pitch is at rest.
  const litColors = useMemo<ReadonlyMap<number, string>>(() => {
    if ("get" in lit) return lit; // already a pitch → color map
    const m = new Map<number, string>();
    for (const pitch of lit) m.set(pitch, "");
    return m;
  }, [lit]);

  // Memoized, not filtered inline: the drawn skin memoizes every key's path
  // string on the lane array's identity, so a fresh array each render would
  // rebuild all 88 outlines on every note-on.
  const whites = useMemo(() => lanes.filter((k) => !k.isBlack), [lanes]);
  const blacks = useMemo(() => lanes.filter((k) => k.isBlack), [lanes]);
  const firstWhitePitch = whites[0]?.pitch;

  const renderLane = (k: KeyLane) => {
    const raw = litColors.get(k.pitch); // undefined → rest, "" → accent, else color
    const isLit = raw !== undefined;
    // One inline-style path for both highlight forms: the accent is just an
    // explicit color of `var(--primary)`.
    const litColor = litKeyColor(raw);
    // A lit black key takes the darker accidental shade in the flat style (where
    // the key IS the fill color); realistic builds its own darkness from the
    // gradient over near-black, so it keeps the base color (see `accidentalColor`).
    const blackLit =
      litColor !== undefined && style === "flat"
        ? accidentalColor(litColor)
        : litColor;
    return (
      <div
        key={k.pitch}
        // Hit-test target for the playable keyboard: the pointer handlers read
        // `data-pitch` off the topmost element under the pointer (decorative
        // layers are pointer-events-none), so black-over-white stacking and
        // glissando resolve for free. Inert when `interaction` is absent.
        data-pitch={k.pitch}
        // eslint-disable-next-line layout/no-adhoc-layout -- computed key geometry (left/width from key-layout projection); flex/items-end/justify-center bottom-center the key label inside the lane
        className={cn(
          "absolute flex items-end justify-center",
          k.isBlack ? "top-0 z-raised" : "bottom-0 top-0",
        )}
        style={{
          left: `${(k.center - k.width / 2) * 100}%`,
          width: `${k.width * 100}%`,
          ...KEY_BOTTOM_RADIUS,
          ...(k.isBlack
            ? blackKeyStyle(blackLit, style)
            : whiteKeyStyle(litColor, style, k.pitch === firstWhitePitch)),
        }}
      >
        {k.isBlack && style === "realistic" && (
          <div
            aria-hidden
            // eslint-disable-next-line layout/no-adhoc-layout -- computed black-key face: height (14%/8%) and negative z-index (-1, paints behind the in-flow label) come from BLACK_FACE; not a clean Pin anchor
            className="pointer-events-none absolute inset-x-0 bottom-0"
            style={{ ...BLACK_FACE(litColor), ...KEY_BOTTOM_RADIUS }}
          />
        )}
        {renderKey?.(k, isLit)}
      </div>
    );
  };

  return (
    <Clip
      {...playProps}
      className={cn("relative", interaction && "select-none", className)}
      // Physical keyboard frame — fixed shape, preset-independent (see
      // KEY_BOTTOM_RADIUS). overflow-hidden would otherwise clip the corner
      // keys to a theme-token radius. When playable, suppress native touch
      // gestures (so a drag glissando doesn't scroll/zoom) and show the pointer.
      style={{
        borderRadius: "4px",
        ...(interaction ? { touchAction: "none", cursor: "pointer" } : null),
      }}
    >
      {/* Drawn skin (back layer of its group) — the keys AS DRAWN, under key
          divs that carry no chrome of their own under this skin. Painted per
          group so each one sits directly beneath its own divs, and
          pointer-events-none throughout so `data-pitch` hit-testing is
          untouched. Absent entirely under flat / realistic. */}
      {keys.skin === "drawn" && (
        <SketchKeys
          lanes={whites}
          group="white"
          palette={keys}
          litColors={litColors}
        />
      )}
      {/* White keys (back layer). */}
      {whites.map(renderLane)}
      {/* Red felt strip across the keybed top — above whites, below blacks.
          `decorative` makes it pointer-events-none, so playable-keyboard
          hit-tests fall through to the key beneath it. The drawn skin has no
          felt: it draws a pencil rule in the same place instead (a red bar
          across a pencil drawing reads as a sticker), so it stands down here. */}
      {style !== "drawn" && (
        <Pin to="top" stretch decorative aria-hidden style={feltStyle(style)} />
      )}
      {keys.skin === "drawn" && (
        <SketchKeys
          lanes={blacks}
          group="black"
          palette={keys}
          litColors={litColors}
        />
      )}
      {/* Black keys (front layer), ~62% height. */}
      {blacks.map(renderLane)}
    </Clip>
  );
}
