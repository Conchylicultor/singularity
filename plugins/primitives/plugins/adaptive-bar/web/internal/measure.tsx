import {
  createContext,
  useContext,
  type ReactElement,
  type ReactNode,
} from "react";

/**
 * How the bar reads a width.
 *
 * `getBoundingClientRect().width`, never `offsetWidth`: the integer-rounding
 * loops this primitive replaces under-reported by up to 1px per item, which is
 * exactly how a row ends up permanently one pixel too wide and one item too
 * narrow.
 */
export type MeasureWidth = (el: Element) => number;

const domMeasureWidth: MeasureWidth = (el) => el.getBoundingClientRect().width;

/**
 * The measurement seam.
 *
 * There is one legitimate reason to replace it and it is not configurability:
 * **jsdom has no layout engine**, so every rect is zero and the shared
 * `ResizeObserver` stub is inert. Without a seam the fit math — the part with
 * the interesting failure modes — would be reachable only through a real
 * browser, and the browser suite is a geometry gate, not a place to assert that
 * a widget kept its React identity across a re-parent.
 *
 * So a test supplies widths and drives the same code path the browser drives.
 * Nothing else may use this: a consumer that "adjusts" measurement is lying to
 * the layout engine about a number the layout engine owns.
 */
const MeasureWidthContext = createContext<MeasureWidth>(domMeasureWidth);

export function useMeasureWidth(): MeasureWidth {
  return useContext(MeasureWidthContext);
}

/**
 * Are the widths coming from a real layout engine?
 *
 * The bar's two placement guards — "you were given no slack" and "you
 * overshot" — are assertions ABOUT the layout engine: they compare what the fit
 * math believed against what the engine actually did. With the seam replaced
 * there is no engine to contradict, and jsdom happily reports `flex-grow: 0` for
 * every element because nothing applied a stylesheet — so running the guards
 * there would fail every test on a fact about jsdom rather than about the bar.
 */
export function useLayoutMeasured(): boolean {
  return useContext(MeasureWidthContext) === domMeasureWidth;
}

/** Test-only. See {@link MeasureWidth}. */
export function AdaptiveBarMeasure({
  measure,
  children,
}: {
  measure: MeasureWidth;
  children: ReactNode;
}): ReactElement {
  return (
    <MeasureWidthContext.Provider value={measure}>
      {children}
    </MeasureWidthContext.Provider>
  );
}

/** What the row's own computed style says about the space it has to give. */
export interface RowMetrics {
  /**
   * The gap between two adjacent occupants, read from the RENDERED element
   * rather than from the `gap` prop it was built from.
   *
   * The prop names a role on the density ramp; the pixels it resolves to depend
   * on the active density preset, which changes at runtime. Re-deriving the
   * number from the role would be a second source of truth that silently
   * desyncs the moment a preset changes — the `MORE_BTN_W = 32` mistake in a
   * different costume.
   */
  gapPx: number;
  /**
   * Horizontal padding + border: the part of the row's border box that its
   * occupants are NOT laid out in.
   *
   * The fit's budget has to be the CONTENT box, because that is the box the
   * occupants are laid out in and the box `measureRowOverflow` compares them
   * against. Reading `getBoundingClientRect().width` and stopping there gave the
   * fit a budget one padding wider than the room that exists, so a consumer
   * adding padding to a bar root would produce a row the fit blessed and the
   * engine overflowed — a `row-overflow` fault caused by the guard's own
   * arithmetic rather than by the layout.
   *
   * That was invisible while occupants could be squeezed: flex absorbed the
   * difference, the spans summed to the content box, and the guard measured no
   * overflow however much padding the root carried.
   */
  insetPx: number;
}

/**
 * The row's gap and its horizontal inset, from ONE computed-style read.
 *
 * Together rather than separately because they are read at the same instant for
 * the same decision, and a second `getComputedStyle` is a second chance for the
 * two to describe different layouts.
 *
 * A non-numeric answer (`"normal"`, or jsdom's empty string) is not a length, so
 * it contributes nothing rather than a `NaN` that would poison every sum.
 */
export function readRowMetrics(el: Element): RowMetrics {
  const style = getComputedStyle(el);
  return {
    gapPx: lengthPx(style.columnGap),
    insetPx:
      lengthPx(style.paddingLeft) +
      lengthPx(style.paddingRight) +
      lengthPx(style.borderLeftWidth) +
      lengthPx(style.borderRightWidth),
  };
}

function lengthPx(raw: string): number {
  const px = Number.parseFloat(raw);
  return Number.isFinite(px) ? px : 0;
}
