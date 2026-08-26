import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  type InTreeLayer,
  zLayerClass,
} from "@plugins/primitives/plugins/css/plugins/z-layers/web";
import type React from "react";

/**
 * One coordinate: a number of CSS pixels, or any CSS length/percentage written
 * out (`"50%"`, `"2rem"`, `"calc(100% - 4px)"`).
 *
 * Numbers are px because every corpus site that hands this primitive a number
 * measured one — a `DOMRect`, a scroll offset, a virtualizer's `start`. There is
 * deliberately no unit prop: a site that wants a fraction says so with
 * {@link pct}, and a site that wants a ramp step is not a coordinate site at all
 * (that is `<Pin offset>`).
 */
export type Coord = number | string;

/**
 * How a box occupies ONE axis. `"fill"` spans the axis end to end; otherwise an
 * anchored arm.
 *
 * **The `?: never` keys are the point.** Over-specifying an axis
 * (`{ start, end, size }`, `{ center, start }`) is a real mistake with a silent
 * outcome — CSS resolves the conflict by dropping whichever property loses, and
 * the box lands somewhere plausible. Declaring the conflicting keys as optional
 * `never` on each arm turns it into a `tsc` error at the call site.
 *
 * Every arm declares EVERY key for a second reason: `in`-narrowing is defeated by
 * an optional `never` (`"end" in e` is true for `{ end: undefined }`), so
 * {@link placedStyle} resolves the arm **by value** instead. A future arm that
 * omits a key would silently opt out of that.
 */
export type Extent =
  | "fill"
  | {
      start: Coord;
      size?: Coord;
      minSize?: Coord;
      shift?: Coord;
      end?: never;
      center?: never;
    }
  | {
      end: Coord;
      size?: Coord;
      minSize?: Coord;
      shift?: Coord;
      start?: never;
      center?: never;
    }
  | {
      start: Coord;
      end: Coord;
      shift?: Coord;
      size?: never;
      minSize?: never;
      center?: never;
    }
  | {
      center: Coord;
      size?: Coord;
      minSize?: Coord;
      start?: never;
      end?: never;
      shift?: never;
    };

/** Which axis an extent is being resolved on. */
type Axis = "x" | "y";

/** A `Coord` as a CSS length. Bare numbers are px. */
function len(v: Coord): string {
  return typeof v === "number" ? `${v}px` : v;
}

/**
 * A fraction as the percentage string 14 call sites hand-rolled as
 * `` `${f * 100}%` ``.
 *
 * **Unclamped and unrounded, on purpose.** Culling a tick that falls outside its
 * track is the caller's decision (`gantt-rows.tsx` filters on the fraction
 * before it ever gets here), and rounding would move pixels that are correct
 * today — sub-percent precision is exactly what a zoomed Gantt is made of.
 */
export function pct(fraction: number): string {
  return `${fraction * 100}%`;
}

/** The four CSS properties one axis writes. */
const AXIS_KEYS = {
  x: {
    start: "left",
    end: "right",
    size: "width",
    minSize: "minWidth",
  },
  y: {
    start: "top",
    end: "bottom",
    size: "height",
    minSize: "minHeight",
  },
} as const satisfies Record<Axis, Record<string, keyof React.CSSProperties>>;

/**
 * Resolve one axis into its style properties plus the shift this axis
 * contributes to the shared `translate`.
 *
 * The arm is read BY VALUE (`e.center !== undefined`), never by `in` — see
 * {@link Extent}. `center` is sugar: the anchor goes on the start edge and the
 * box pulls itself back by half its own size, which is one mechanic with two
 * names, not two mechanics.
 */
function resolveAxis(
  e: Extent,
  axis: Axis,
): { style: React.CSSProperties; shift: string | null } {
  const k = AXIS_KEYS[axis];
  const style: React.CSSProperties = {};
  if (e === "fill") {
    style[k.start] = 0;
    style[k.end] = 0;
    return { style, shift: null };
  }
  if (e.center !== undefined) {
    style[k.start] = len(e.center);
    if (e.size !== undefined) style[k.size] = len(e.size);
    if (e.minSize !== undefined) style[k.minSize] = len(e.minSize);
    return { style, shift: "-50%" };
  }
  if (e.start !== undefined) style[k.start] = len(e.start);
  if (e.end !== undefined) style[k.end] = len(e.end);
  if (e.size !== undefined) style[k.size] = len(e.size);
  if (e.minSize !== undefined) style[k.minSize] = len(e.minSize);
  return { style, shift: e.shift === undefined ? null : len(e.shift) };
}

/**
 * The pure coordinate style map — single source of truth, exported so the
 * component and the pure test share one definition.
 *
 * **Both axes are required**, and that is the API's one opinionated stance. An
 * absolutely-positioned box with nothing said about an axis keeps its CSS
 * *static position* — it lands wherever it would have been in flow, which is the
 * single genuinely surprising outcome in this corner of CSS and the reason the
 * corpus is full of `absolute top-0` boxes whose author meant "the top". Saying
 * `x="fill"` costs one word and removes the whole question.
 *
 * **It writes the CSS `translate` property and NEVER `transform`.** Several
 * consumers (the Sonata progress bar, the piano roll, the notation cursor) drive
 * `el.style.transform` from a ref every frame. `translate` is applied before
 * `transform` by the spec, so the two compose: this primitive owns the placement,
 * the writer owns the per-frame motion, and there is no combination to avoid and
 * no rule to remember. (Tailwind v4 emits `-translate-x-1/2` as `translate` too,
 * which is why `<Pin to="center">` is already safe beside such a writer.)
 *
 * `shift` is per-AXIS rather than a whole-component mode because real sites mix
 * them: a windowed row is `left/right` inset with only its `y` composited, and a
 * loop region needs an inset base AND a shift on top.
 */
export function placedStyle(x: Extent, y: Extent): React.CSSProperties {
  const rx = resolveAxis(x, "x");
  const ry = resolveAxis(y, "y");
  const style: React.CSSProperties = { ...rx.style, ...ry.style };
  // No shift on either axis ⇒ no `translate` key at all, so a placed box never
  // silently declares a transform-adjacent property it does not use.
  if (rx.shift !== null || ry.shift !== null) {
    style.translate = `${rx.shift ?? "0"} ${ry.shift ?? "0"}`;
  }
  return style;
}

/** What a caller may say about a placed box beyond its two coordinates. Both
 *  halves are optional — {@link placedClasses} owns the defaults. */
export interface PlacedOptions {
  /**
   * Stacking level among siblings, from the z-layer scale. **Defaults to no z
   * class at all** — deliberately unlike `<Pin>`, which defaults to `raised`.
   *
   * Every bar, marker and overlay this primitive replaces paints by DOM order
   * today, and even `z-index: 0` would open a stacking context none of them
   * asked for. Say `layer` when the box genuinely has to jump its siblings.
   */
  layer?: InTreeLayer;
  /** Make the box click-through (`pointer-events-none`) — a ruler line, a
   *  playhead, a highlight band that must never eat a click. Defaults to false. */
  decorative?: boolean;
}

/**
 * The pure coordinate class map — single source of truth, exported so the
 * component and the pure test share one definition.
 *
 * A placed box is `absolute` plus, optionally, a stacking level and
 * click-through. Everything geometric is inline style, because it is a runtime
 * number: there is no class for `left: 37.4%`.
 *
 * **The defaults live HERE, not in `<Placed>`** — the `layer` precedent, and a
 * deliberate divergence from `pinClasses`/`<Pin>`, which declares each default
 * twice (once in the destructuring, once in the prop docs) and so can drift.
 */
export function placedClasses(opts: PlacedOptions = {}): string {
  const { layer, decorative = false } = opts;
  return [
    "absolute",
    layer === undefined ? null : zLayerClass(layer),
    decorative ? "pointer-events-none" : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export interface PlacedProps
  extends PlacedOptions, React.HTMLAttributes<HTMLElement> {
  /** Horizontal extent. Required — see {@link placedStyle}. */
  x: Extent;
  /** Vertical extent. Required — see {@link placedStyle}. */
  y: Extent;
  /** Host element/component. Defaults to a `div`. */
  as?: React.ElementType;
  /** Forwarded to the rendered element (mirrors Layer/Clip/Fill/Pin). */
  ref?: React.Ref<HTMLElement>;
}

/**
 * The sanctioned **coordinate-space** primitive — a box placed by runtime
 * numbers inside a caller-owned positioned host: Gantt bars, piano-roll notes,
 * windowed-row offsets, drag ghosts, crop rectangles, `DOMRect` highlights,
 * editor decorations.
 *
 * Against `<Pin>` the split is where the number comes from, not how big it is.
 * **Pin places by a semantic ramp step** (`to="top-right" offset="sm"`) — a
 * decision an author makes and a density preset can rescale. **Placed places by
 * a measurement** — a fraction of a track, a `DOMRect`, a virtualizer offset —
 * which no ramp can express and no preset may rescale. Pin's docs used to send
 * those sites to a per-file `eslint-disable`; the corpus says that call was
 * wrong, and this primitive is the answer instead.
 *
 * Against `<Layer>`: a Layer is `inset-0` on both axes and carries no
 * coordinate. If your box has no number in it, you want Layer.
 *
 * **Reach for {@link placedStyle} + {@link placedClasses} rather than this
 * component whenever you do not own the element** — a raw `<canvas>`/`<svg>`
 * leaf that must ITSELF be placed, an element carrying `setPointerCapture` or
 * drag listeners (a wrapper would become the hit-test target and change
 * behaviour), or a third-party component exposing only `className`/`style`. Own
 * the element ⇒ `<Placed>`; don't ⇒ the helpers.
 *
 * Caller `className` composes last, and caller `style` overrides the resolved
 * coordinates.
 */
export function Placed({
  x,
  y,
  layer,
  decorative,
  as: As = "div",
  ref,
  className,
  style,
  children,
  ...rest
}: PlacedProps) {
  return (
    <As
      ref={ref}
      className={cn(placedClasses({ layer, decorative }), className)}
      style={{ ...placedStyle(x, y), ...style }}
      {...rest}
    >
      {children}
    </As>
  );
}
