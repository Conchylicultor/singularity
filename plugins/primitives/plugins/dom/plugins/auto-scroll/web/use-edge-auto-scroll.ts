import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  useEventCallback,
  useLatestRef,
} from "@plugins/primitives/plugins/latest-ref/web";
import { findScrollParent } from "./internal/find-scroll-parent";

export interface UseEdgeAutoScrollOptions {
  /** Any element inside the scroll viewport; the hook walks up to find the scroller. */
  anchorRef: RefObject<HTMLElement | null>;
  /**
   * Fired after each frame that ACTUALLY moved the surface, with the last tracked
   * pointer position. This is where a gesture re-evaluates itself: while the
   * pointer sits still at an edge it is the only thing driving the gesture forward
   * — the pointer did not move, the CONTENT did.
   */
  onScroll: (clientY: number) => void;
  /** Distance from the edge at which scrolling starts, px. Default 48. */
  threshold?: number;
  /** Speed at (or past) the edge, px/sec. Default 900. */
  maxSpeed?: number;
}

export interface EdgeAutoScroll {
  /**
   * Feed the gesture's current viewport `clientY`. Starts the loop inside an edge
   * band, idles it outside. Idempotent — safe to call on every pointermove.
   */
  track: (clientY: number) => void;
  /** End the gesture. Call from pointerup AND pointercancel; also runs on unmount. */
  stop: () => void;
}

const DEFAULT_THRESHOLD = 48;
const DEFAULT_MAX_SPEED = 900;

/**
 * A rAF resume after the tab was hidden reports the whole hidden interval as one
 * frame delta. Integrating that would teleport the surface by seconds' worth of
 * scroll in a single step, so the delta is capped.
 *
 * The cap must sit well ABOVE a slow-but-real frame, because clamping one does
 * not merely smooth the motion — it silently throttles the scroll to
 * `cap / frameTime` of the requested speed. A consumer whose `onScroll` re-renders
 * a long list can easily run at ~200ms per frame; measured at a 50ms cap, an
 * edge hold moved 118px/s against a requested 506px/s, and the ramp looked broken
 * rather than slow. 250ms clears any frame the loop can plausibly produce while
 * still bounding a hidden-tab resume to one screenful.
 */
const MAX_FRAME_DELTA_MS = 250;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Speed fraction for a pointer `distance` px inside the edge band. `distance`
 * goes NEGATIVE once the pointer passes the edge — a held button gives implicit
 * pointer capture, so window-level `pointermove` keeps firing with the pointer
 * outside the viewport entirely. Clamped to full speed there; never extrapolated
 * into a runaway. Eased (`t * t`) rather than linear, which reads as a smooth
 * ramp-in instead of a jump at the band's boundary.
 */
function speedFraction(distance: number, threshold: number): number {
  const t = clamp01((threshold - distance) / threshold);
  return t * t;
}

/**
 * The edge band in VIEWPORT coordinates. For a real scroller that is its own
 * rect; for `document.scrollingElement` it is the viewport, because that
 * element's rect is the whole DOCUMENT's box (a long page's bottom edge sits
 * thousands of px below the screen, so its rect would put the band nowhere the
 * pointer can reach).
 */
function edgeBand(el: HTMLElement): { top: number; bottom: number } {
  if (el === document.scrollingElement) {
    return { top: 0, bottom: window.innerHeight };
  }
  const rect = el.getBoundingClientRect();
  return { top: rect.top, bottom: rect.bottom };
}

/** Signed px/sec for the current pointer position: + scrolls down, - scrolls up, 0 idles. */
function velocityFor(
  el: HTMLElement,
  clientY: number,
  threshold: number,
  maxSpeed: number,
): number {
  const { top, bottom } = edgeBand(el);
  const fromTop = clientY - top;
  const fromBottom = bottom - clientY;
  // The nearer edge decides the direction, so a viewport shorter than two bands
  // can never satisfy both at once.
  if (fromBottom <= fromTop) {
    return fromBottom >= threshold
      ? 0
      : speedFraction(fromBottom, threshold) * maxSpeed;
  }
  return fromTop >= threshold
    ? 0
    : -speedFraction(fromTop, threshold) * maxSpeed;
}

/**
 * Scroll the anchor's scroll parent while a gesture's pointer sits in the top or
 * bottom edge band, ramping up the closer to the edge — the "drag past the
 * viewport and the document follows" behavior, factored out of any one gesture.
 *
 * Gesture-agnostic: the hook knows nothing but a viewport `clientY`. The caller
 * feeds it from whatever it is tracking (`track`) and re-applies its own per-frame
 * work from `onScroll`; the two are deliberately distinct callers of one applier —
 * "the pointer moved" and "the surface moved" — so the hook can never re-latch
 * itself off its own callback.
 *
 * **Vertical only, deliberately.** A speculative `axis` option buys nothing for a
 * consumer that scrolls on one axis, and an unused code path is an untested one.
 *
 * Never calls `setPointerCapture`: retargeting events would break gestures that
 * deliberately leave the press with its original target (native text selection,
 * say). A held button already gives implicit capture, which is why the ramp only
 * has to tolerate a pointer outside the window.
 */
export function useEdgeAutoScroll({
  anchorRef,
  onScroll,
  threshold = DEFAULT_THRESHOLD,
  maxSpeed = DEFAULT_MAX_SPEED,
}: UseEdgeAutoScrollOptions): EdgeAutoScroll {
  // Read the callback through a ref so a fresh identity on every render never
  // restarts (or reschedules) an in-flight loop.
  const onScrollRef = useLatestRef(onScroll);

  // Per-gesture state. `scrollElRef` is resolved lazily on the first `track` and
  // released by `stop` — see `track`.
  const scrollElRef = useRef<HTMLElement | null>(null);
  const clientYRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  // Sub-pixel remainder: `scrollBy` moves in whole px, so a slow ramp (< 1px per
  // frame) would otherwise never move at all.
  const remainderRef = useRef(0);

  /**
   * Start the loop unless it is already running.
   *
   * A gesture-lifetime animation loop, NOT polling: it exists only between a
   * `track` and its `stop`, and idles itself the moment the velocity reaches
   * zero, so a parked pointer outside the band costs nothing.
   *
   * The body is a HOISTED function declaration in here rather than a
   * `useEventCallback` at hook scope, because a self-scheduling callback at hook
   * scope has to name its own binding before that binding exists —
   * `react-hooks/immutability` rejects that, rightly: a forward reference to a
   * reactive value is frozen at the identity it had when it was captured. Local,
   * it is ordinary recursion. `startLoop` is itself an event callback, so each
   * gesture picks up the current `threshold` / `maxSpeed` when it starts.
   */
  const startLoop = useEventCallback(() => {
    if (rafRef.current !== null) return;

    function step(time: number): void {
      const el = scrollElRef.current;
      if (!el) {
        rafRef.current = null;
        lastTimeRef.current = null;
        return;
      }

      const dt =
        Math.min(time - (lastTimeRef.current ?? time), MAX_FRAME_DELTA_MS) /
        1000;
      lastTimeRef.current = time;

      const velocity = velocityFor(el, clientYRef.current, threshold, maxSpeed);
      if (velocity === 0) {
        // Outside the band: stop scheduling. `track` restarts the loop when the
        // pointer comes back — an idle gesture burns no frames.
        rafRef.current = null;
        lastTimeRef.current = null;
        remainderRef.current = 0;
        return;
      }

      remainderRef.current += velocity * dt;
      const stepPx = Math.trunc(remainderRef.current);
      remainderRef.current -= stepPx;
      if (stepPx !== 0) {
        const before = el.scrollTop;
        // `instant`, never the container's CSS `scroll-behavior`: a smooth scroll
        // settles asynchronously, so the moved-check below would read `before` on
        // every frame and the loop would pile animations onto each other.
        el.scrollBy({ top: stepPx, behavior: "instant" });
        // Only report a frame that MOVED the surface. At a clamped top/bottom edge
        // the scroll is a no-op, and the consumer's per-frame work (which can be as
        // expensive as a querySelectorAll + a rect per row) must not run for nothing.
        if (el.scrollTop !== before) onScrollRef.current(clientYRef.current);
      }

      rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);
  });

  const track = useEventCallback((clientY: number) => {
    clientYRef.current = clientY;
    // Resolve the scroller lazily, once per gesture (`stop` clears it), never at
    // mount: the anchor may not be mounted yet when the hook first runs, and a
    // host is free to re-parent the surface between gestures.
    scrollElRef.current ??= findScrollParent(anchorRef.current, {
      requireOverflowing: true,
    });
    startLoop();
  });

  const stop = useEventCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastTimeRef.current = null;
    remainderRef.current = 0;
    scrollElRef.current = null;
  });

  // Unmounting mid-gesture must never leave a loop scrolling a detached surface.
  useEffect(() => stop, []);

  // A STABLE object of stable callbacks, carrying no refs: `react-hooks/refs`
  // reads any post-render `obj.foo` on a ref-carrying object as a ref access, so
  // a handle that exposed its refs could not be dereferenced at the call site.
  return useMemo(() => ({ track, stop }), []);
}
