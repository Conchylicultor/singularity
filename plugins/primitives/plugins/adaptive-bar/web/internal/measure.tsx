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

/**
 * The row's gap, read from the rendered element rather than from the `gap` prop
 * it was built from.
 *
 * The prop names a role on the density ramp; the pixels it resolves to depend on
 * the active density preset, which changes at runtime. Re-deriving the number
 * from the role would be a second source of truth that silently desyncs the
 * moment a preset changes — the `MORE_BTN_W = 32` mistake in a different
 * costume.
 *
 * A non-numeric answer (`"normal"`, or jsdom's empty string) is not a width, so
 * it contributes nothing rather than a `NaN` that would poison every sum.
 */
export function readColumnGap(el: Element): number {
  const raw = getComputedStyle(el).columnGap;
  const px = Number.parseFloat(raw);
  return Number.isFinite(px) ? px : 0;
}
