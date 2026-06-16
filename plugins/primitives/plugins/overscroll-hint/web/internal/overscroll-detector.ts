/**
 * Framework-free core for the overscroll hint.
 *
 * Gives the app a native-feeling elastic **rubber-band** when a wheel /
 * trackpad / touch gesture is fully **wasted** — nothing actually scrolls
 * because the surface isn't scrollable or is already pinned at the edge in that
 * direction. Like iOS/macOS overscroll, the surface follows the gesture *live*:
 * it translates proportionally to how hard you push (damped by ever-increasing
 * resistance, so it asymptotes instead of running away), then springs back when
 * the gesture stops. Every push against the wall produces movement — there is
 * no one-shot animation to "use up".
 *
 * Detection is cheap and 100% accurate: we record each gesture, then on the
 * next animation frame we check whether ANY real `scroll` event fired in the
 * meantime. If none did, the browser genuinely scrolled nothing → wasted.
 * Expensive style reads (getComputedStyle) only happen on the rare wasted path,
 * never on the hot wheel path.
 */

type Axis = "x" | "y";

interface PendingGesture {
  /** Native wheel event kept so we can read `defaultPrevented` after propagation. */
  event: Event | null;
  deltaX: number;
  deltaY: number;
  target: EventTarget | null;
  scrolledSince: boolean;
}

/** A surface currently being held in an overscrolled (rubber-banded) state. */
interface ActiveOverscroll {
  el: HTMLElement;
  axis: Axis;
  /** Accumulated signed overscroll intent (raw px) for the current gesture. */
  raw: number;
}

/** Minimum dominant-axis delta (px) for a gesture to count. */
const MIN_DELTA = 2;
/** The furthest the surface can rubber-band, in px (the resistance asymptote). */
const MAX_PULL = 48;
/** Resistance factor — higher reaches MAX_PULL faster (stiffer past the wall). */
const RESISTANCE = 0.5;
/**
 * Quiet gap (ms) after the last wasted gesture event that ends the gesture and
 * triggers the spring-back. Long enough to ride a trackpad-momentum tail as one
 * continuous hold, short enough that releasing snaps back promptly.
 */
const GESTURE_END_GAP_MS = 150;
/** Spring-back duration + easing (slight overshoot → native bounce feel). */
const SPRING_MS = 420;
const SPRING_EASE = "cubic-bezier(0.34, 1.4, 0.5, 1)";
/** Safety net to clear the snap-back styles if `transitionend` never fires. */
const SPRING_FALLBACK_MS = SPRING_MS + 120;
const SCROLLABLE_OVERFLOW = new Set(["auto", "scroll", "overlay"]);

/**
 * Install the global wasted-scroll detector. Returns a cleanup function that
 * removes every listener, cancels any pending frame, and resets any surface
 * left mid-rubber-band.
 */
export function installOverscrollHint(): () => void {
  let pending: PendingGesture | null = null;
  let rafId: number | null = null;
  let active: ActiveOverscroll | null = null;
  let endTimer: number | null = null;

  let touchStartX = 0;
  let touchStartY = 0;

  function reducedMotion(): boolean {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function recordGesture(
    event: Event | null,
    deltaX: number,
    deltaY: number,
    target: EventTarget | null,
  ): void {
    if (Math.abs(deltaY) < MIN_DELTA && Math.abs(deltaX) < MIN_DELTA) return;
    pending = { event, deltaX, deltaY, target, scrolledSince: false };
    if (rafId === null) {
      rafId = requestAnimationFrame(runDetection);
    }
  }

  function runDetection(): void {
    rafId = null;
    const gesture = pending;
    pending = null;
    if (!gesture) return;

    // A real scroll happened somewhere → not wasted.
    if (gesture.scrolledSince) return;

    // The gesture was intentionally consumed (e.g. graph zoom / canvas pan).
    if (gesture.event?.defaultPrevented) return;

    const axis: Axis =
      Math.abs(gesture.deltaX) > Math.abs(gesture.deltaY) ? "x" : "y";
    const delta = axis === "x" ? gesture.deltaX : gesture.deltaY;
    if (delta === 0) return;
    if (reducedMotion()) return;

    const surface = pickScrollSurface(
      gesture.target instanceof Element ? gesture.target : null,
      axis,
    );
    if (!(surface instanceof HTMLElement)) return;

    // Start a fresh hold, or continue the current one. A change of surface or
    // axis settles the old hold first so it springs back cleanly.
    if (!active || active.el !== surface || active.axis !== axis) {
      if (active) springBack(active);
      active = { el: surface, axis, raw: 0 };
      surface.style.transition = "none";
      surface.style.willChange = "transform";
    }
    active.raw += delta;
    applyOffset(active);

    // (Re)arm the spring-back: it fires once the gesture stream goes quiet.
    if (endTimer !== null) window.clearTimeout(endTimer);
    endTimer = window.setTimeout(onGestureEnd, GESTURE_END_GAP_MS);
  }

  function onGestureEnd(): void {
    endTimer = null;
    if (!active) return;
    const held = active;
    active = null;
    springBack(held);
  }

  /** Damped displacement: asymptotes toward MAX_PULL as |raw| grows. */
  function damp(raw: number): number {
    const d = Math.abs(raw);
    const pulled = MAX_PULL * (1 - MAX_PULL / (MAX_PULL + d * RESISTANCE));
    return Math.sign(raw) * pulled;
  }

  function applyOffset(held: ActiveOverscroll): void {
    // Scrolling down/right at a dead end nudges content UP/LEFT, like native
    // overscroll: positive delta → negative offset.
    const offset = -damp(held.raw);
    held.el.style.transform =
      held.axis === "y" ? `translateY(${offset}px)` : `translateX(${offset}px)`;
  }

  function springBack(held: ActiveOverscroll): void {
    const el = held.el;
    el.style.transition = `transform ${SPRING_MS}ms ${SPRING_EASE}`;
    el.style.transform =
      held.axis === "y" ? "translateY(0px)" : "translateX(0px)";

    const clear = (): void => {
      el.style.transition = "";
      el.style.transform = "";
      el.style.willChange = "";
      window.clearTimeout(fallback);
    };
    el.addEventListener("transitionend", clear, { once: true });
    // Safety net only — if `transitionend` somehow never fires we still reset.
    const fallback = window.setTimeout(clear, SPRING_FALLBACK_MS);
  }

  function pickScrollSurface(start: Element | null, axis: Axis): Element | null {
    const overflowProp =
      axis === "x" ? "overflow-x" : ("overflow-y" as const);
    let el: Element | null = start;
    while (el) {
      const overflow = getComputedStyle(el).getPropertyValue(overflowProp);
      if (SCROLLABLE_OVERFLOW.has(overflow.trim())) return el;
      el = el.parentElement;
    }
    // Fallback chain: nearest pane → main → scrolling root.
    const pane = start?.closest("[data-pane-id]");
    if (pane) return pane;
    const main = document.querySelector("main");
    if (main) return main;
    return document.scrollingElement ?? document.documentElement;
  }

  function onWheel(event: WheelEvent): void {
    if (event.ctrlKey) return; // pinch-zoom, not a scroll
    recordGesture(event, event.deltaX, event.deltaY, event.target);
  }

  function onScroll(): void {
    if (pending) pending.scrolledSince = true;
  }

  function onTouchStart(event: TouchEvent): void {
    const t = event.touches[0];
    if (!t) return;
    touchStartX = t.clientX;
    touchStartY = t.clientY;
  }

  function onTouchMove(event: TouchEvent): void {
    const t = event.touches[0];
    if (!t) return;
    // Finger up = content scrolls down, so delta is inverted to match wheel sign.
    const deltaX = touchStartX - t.clientX;
    const deltaY = touchStartY - t.clientY;
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    recordGesture(event, deltaX, deltaY, event.target);
  }

  function onTouchEnd(): void {
    // Lifting the finger ends the gesture immediately — spring back now rather
    // than waiting out the quiet gap (which only exists for wheel momentum).
    if (endTimer !== null) {
      window.clearTimeout(endTimer);
      endTimer = null;
    }
    onGestureEnd();
  }

  window.addEventListener("wheel", onWheel, { passive: true });
  window.addEventListener("scroll", onScroll, { capture: true, passive: true });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("touchcancel", onTouchEnd, { passive: true });

  return () => {
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("scroll", onScroll, { capture: true });
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchmove", onTouchMove);
    window.removeEventListener("touchend", onTouchEnd);
    window.removeEventListener("touchcancel", onTouchEnd);
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (endTimer !== null) window.clearTimeout(endTimer);
    if (active) {
      active.el.style.transition = "";
      active.el.style.transform = "";
      active.el.style.willChange = "";
      active = null;
    }
  };
}
