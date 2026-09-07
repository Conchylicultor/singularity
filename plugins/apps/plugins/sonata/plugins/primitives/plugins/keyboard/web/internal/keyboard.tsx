import { Fragment, type CSSProperties, type ReactNode, useMemo } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import {
  Placed,
  pct,
} from "@plugins/primitives/plugins/css/plugins/coords/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { useConfig } from "@plugins/config_v2/web";
import {
  asSonataLook,
  SONATA_LOOK_STYLES,
  sonataLookConfig,
} from "@plugins/apps/plugins/sonata/plugins/look/core";
import {
  isAccidental,
  type PitchKey,
  type PitchPlane,
} from "@plugins/apps/plugins/sonata/plugins/score/core";
import { litKeyColor } from "./key-color";
import {
  KEY_CHROME,
  type KeyTier,
  type LabelTone,
  type LitKey,
} from "./chrome";
import {
  usePlayableKeyboard,
  type KeyboardInteraction,
} from "./use-playable-keyboard";

/**
 * The keyboard renders a `PitchPlane` — a set of pads with fractional boxes and
 * a layout name — and nothing else. It has no geometry of its own: the very
 * plane the falling notes were laid on is handed in, which is what makes "a note
 * lands on its key" true by construction rather than by two formulas agreeing.
 *
 * WHAT THE PRIMITIVE OWNS, and a chrome therefore cannot break: the key element
 * itself and its `data-pitch` (the hit target `usePlayableKeyboard` reads, so
 * glissando and multi-touch work on every layout), the paint order, the box, the
 * lit lookup, the label host, the frame, and the pointer handlers. A chrome
 * (`chrome/`) only answers what colour a key is.
 *
 * Which chrome paints is `plane.layout` — the layout the plane was actually laid
 * in — never a second config read. A keyboard cannot be drawn as a piano while
 * its pads are Jankó's, because there is no second place to disagree with.
 */

/**
 * Which keys are highlighted and how:
 *  - array form: each listed pitch lights in the theme accent (`var(--primary)`).
 *  - map form: each pitch lights in its mapped CSS color (e.g. per-track
 *    colors); an empty-string value falls back to the accent.
 */
export type KeyHighlight = ReadonlyArray<number> | ReadonlyMap<number, string>;

/** What a `renderKey` callback is told about the key it is drawing into. */
export interface KeyRenderState {
  lit: boolean;
  /** Which label colour reads on this key at rest — the chrome's answer, so the
   *  caller never has to know which skin is painting. */
  tone: LabelTone;
  /** Narrower than the plane's widest key. The piano's accidentals are the case
   *  it exists for (a 7px label instead of 9px); on a layout of uniform pads
   *  nothing is narrow. */
  narrow: boolean;
}

export interface KeyboardProps {
  /**
   * The pads to draw, and the layout they were laid in. Comes from
   * `pitchGeometry()` / `usePitchGeometry()` — there is deliberately no
   * `low`/`high` pair here, because a range is not a layout and re-deriving one
   * is how a keyboard drifts off the notes falling onto it.
   */
  plane: PitchPlane;
  /** Pitches to highlight (e.g. a chord voicing or the keys sounding now). */
  lit: KeyHighlight;
  /**
   * Optional content drawn inside each key, seated near its front edge (e.g. a
   * note label). Receives the key and how it is being drawn, so the caller owns
   * all content styling. Called once per PAD: a layout where a pitch has two
   * pads labels both.
   */
  renderKey?: (key: PitchKey, state: KeyRenderState) => ReactNode;
  /**
   * Derives the color a lit ACCIDENTAL shows from its base lit color — Synthesia
   * draws accidentals a shade darker than naturals, so a lit accidental is darker
   * than a lit natural of the same track. Injected (rather than imported) to keep
   * this primitive dependency-free: the caller owns the actual palette
   * relationship (the same `accidentalColor` the falling notes use), so the key
   * and the note that lands on it stay in lockstep. Which skins apply it is the
   * chrome's call. Defaults to identity.
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
  /**
   * Merged onto the frame, after its own fixed shape. For the one thing a class
   * cannot say: the keybed height, which is a number the LAYOUT chooses
   * (`pitchKeyboardHeight`) — four rows of Jankó pads need more room than one
   * row of piano keys, and no size class can be picked ahead of the layout.
   */
  style?: CSSProperties;
}

/** A key counts as narrow below this share of the plane's widest key. */
const NARROW_RATIO = 0.9;

/** Group the plane's pads by paint tier, ascending. Memoized on the plane, so
 *  the per-tier arrays keep their identity — the drawn skin memoizes every
 *  key's path string on them, and a fresh array each render would rebuild all
 *  88 outlines on every note-on. */
function groupTiers(keys: readonly PitchKey[]): KeyTier[] {
  const byTier = new Map<number, PitchKey[]>();
  for (const key of keys) {
    const bucket = byTier.get(key.tier);
    if (bucket) bucket.push(key);
    else byTier.set(key.tier, [key]);
  }
  return [...byTier.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tier, tierKeys]) => ({ tier, keys: tierKeys }));
}

/**
 * Stateless keyboard: the single source of truth for how a pitch pad is drawn
 * and lit. Knows nothing about chords, scores, or playback — the caller supplies
 * the plane, which pitches to light (and in what color), and any per-key
 * content. The full projection-driven `PianoKeyboard` and the chord/key readouts
 * all compose this. The skin is read from Sonata's look, so the choice applies
 * everywhere a keyboard renders. Height is set by the caller via `className` or
 * a `style` height; the pads fill it.
 */
export function Keyboard({
  plane,
  lit,
  renderKey,
  accidentalColor = (c) => c,
  interaction,
  className,
  style,
}: KeyboardProps) {
  const { look } = useConfig(sonataLookConfig);
  // One read, one skin. The whole `keys` union stays in hand (rather than just
  // `keys.skin`) so the drawn arm's palette is reached by narrowing, never by
  // asserting that a look which draws must have brought colours with it.
  const skin = SONATA_LOOK_STYLES[asSonataLook(look)].keys;
  const chrome = KEY_CHROME[plane.layout];
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

  const tiers = useMemo(() => groupTiers(plane.keys), [plane]);
  const narrowBelow = useMemo(() => {
    let widest = 0;
    for (const key of plane.keys) if (key.width > widest) widest = key.width;
    return widest * NARROW_RATIO;
  }, [plane]);

  const decors = chrome.decor({ tiers, skin, litColors });
  // Every tier that has something to paint — the plane's own, plus any a decor
  // names. A decor whose tier is empty still paints (the felt strip belongs
  // under the accidentals even in a window that holds none).
  const order = useMemo(() => {
    const seen = new Set<number>();
    for (const t of tiers) seen.add(t.tier);
    for (const d of decors) seen.add(d.tier);
    return [...seen].sort((a, b) => a - b);
  }, [tiers, decors]);

  const renderPad = (key: PitchKey, indexInTier: number) => {
    const raw = litColors.get(key.pitch); // undefined → rest, "" → accent, else color
    const color = litKeyColor(raw);
    // Resolved once, into both readings a chrome may want: the note's own colour
    // and the accidental-darkened one. A chrome picks; it cannot forget to ask
    // whether the pitch is an accidental, and it cannot darken twice.
    const litKey: LitKey | undefined =
      color === undefined
        ? undefined
        : {
            color,
            accidental: isAccidental(key.pitch)
              ? accidentalColor(color)
              : color,
          };
    const paint = chrome.paintKey(key, litKey, { skin, indexInTier });
    const label = renderKey?.(key, {
      lit: color !== undefined,
      tone: chrome.labelTone(key),
      narrow: key.width < narrowBelow,
    });
    return (
      <Placed
        // A pitch may hold more than one pad (Jankó gives every pitch two rows),
        // so the pitch alone is not a key — the row it sits in completes it.
        key={`${key.pitch}@${key.top}`}
        // Hit-test target for the playable keyboard: the pointer handlers read
        // `data-pitch` off the topmost element under the pointer (decorative
        // layers are pointer-events-none), so overlapping pads and glissando
        // resolve for free. Inert when `interaction` is absent.
        data-pitch={key.pitch}
        x={{ start: pct(key.center - key.width / 2), size: pct(key.width) }}
        y={{ start: pct(key.top), size: pct(key.height) }}
        // No z-layer: the pads paint in DOM order, tier by tier, which is what
        // puts the accidentals over the naturals. `isolate` keeps whatever the
        // chrome's children and the label stack against inside this one key.
        style={{ isolation: "isolate", ...paint.style }}
      >
        {paint.children}
        {/* The label's seat. Pinned rather than laid out in flow, so a chrome's
            own children (the black key's front face) never displace it and the
            key box holds nothing but absolutely-placed layers. */}
        {label !== null && label !== undefined && (
          <Pin to="bottom" offset="2xs" decorative>
            {label}
          </Pin>
        )}
      </Placed>
    );
  };

  return (
    <Clip
      {...playProps}
      className={cn("relative", interaction && "select-none", className)}
      // Physical keyboard frame — fixed shape, preset-independent (like the
      // chromes' own radii). overflow-hidden would otherwise clip the corner
      // keys to a theme-token radius. When playable, suppress native touch
      // gestures (so a drag glissando doesn't scroll/zoom) and show the pointer.
      style={{
        borderRadius: "4px",
        ...(interaction ? { touchAction: "none", cursor: "pointer" } : null),
        ...style,
      }}
    >
      {order.map((tier) => (
        <Fragment key={tier}>
          {decors.map((d) =>
            d.tier === tier ? <Fragment key={d.id}>{d.node}</Fragment> : null,
          )}
          {tiers
            .find((t) => t.tier === tier)
            ?.keys.map((key, i) => renderPad(key, i))}
        </Fragment>
      ))}
    </Clip>
  );
}
