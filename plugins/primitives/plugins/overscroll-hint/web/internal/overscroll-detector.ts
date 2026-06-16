/**
 * Framework-free core for the overscroll hint.
 *
 * Detects a "wasted" scroll gesture — one where the user made a wheel /
 * trackpad / touch scroll motion but NOTHING actually scrolled (the surface
 * isn't scrollable, or is already pinned at the edge in that direction) — and
 * plays a small native-feeling rubber-band bounce on the surface they tried to
 * scroll.
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

/** Minimum dominant-axis delta (px) for a gesture to count. */
const MIN_DELTA = 2;
/** Max nudge offset of the bounce. */
const BUMP_OFFSET = 8;
/**
 * Quiet gap (ms) that marks the end of a scroll gesture. A continuous
 * dead-end wheel / trackpad-momentum / touch burst keeps firing events well
 * within this window, so it bounces exactly ONCE; only after the stream goes
 * quiet for this long does the next deliberate scroll attempt re-arm the bounce.
 */
const GESTURE_END_GAP_MS = 200;
/** Safety net to clear the animation class if `animationend` never fires. */
const BUMP_FALLBACK_MS = 600;
const BUMP_CLASS = "overscroll-bump";
const SCROLLABLE_OVERFLOW = new Set(["auto", "scroll", "overlay"]);

/**
 * Install the global wasted-scroll detector. Returns a cleanup function that
 * removes every listener and cancels any pending frame.
 */
export function installOverscrollHint(): () => void {
  let pending: PendingGesture | null = null;
  let rafId: number | null = null;
  // One bounce per continuous gesture: `armed` flips false on bounce and only
  // re-arms once the gesture stream goes quiet for GESTURE_END_GAP_MS.
  let armed = true;
  let rearmTimer: number | null = null;

  let touchStartX = 0;
  let touchStartY = 0;

  function recordGesture(
    event: Event | null,
    deltaX: number,
    deltaY: number,
    target: EventTarget | null,
  ): void {
    if (Math.abs(deltaY) < MIN_DELTA && Math.abs(deltaX) < MIN_DELTA) return;
    // Every gesture event pushes back the re-arm: the bounce only becomes
    // available again after the user stops scrolling for the quiet gap.
    if (rearmTimer !== null) window.clearTimeout(rearmTimer);
    rearmTimer = window.setTimeout(() => {
      armed = true;
      rearmTimer = null;
    }, GESTURE_END_GAP_MS);
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

    // Already bounced for this gesture — wait for the stream to go quiet.
    if (!armed) return;

    const axis: Axis =
      Math.abs(gesture.deltaX) > Math.abs(gesture.deltaY) ? "x" : "y";
    const delta = axis === "x" ? gesture.deltaX : gesture.deltaY;
    if (delta === 0) return;

    const surface = pickScrollSurface(
      gesture.target instanceof Element ? gesture.target : null,
      axis,
    );
    if (!surface) return;

    armed = false;
    playBounce(surface, axis, delta > 0 ? 1 : -1);
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

  function playBounce(el: Element, axis: Axis, dir: number): void {
    if (el.classList.contains(BUMP_CLASS)) return;
    const style = (el as HTMLElement).style;
    // Scrolling down/right at a dead end nudges content UP/LEFT, like native
    // overscroll: positive delta → negative offset.
    const offset = `${-dir * BUMP_OFFSET}px`;
    if (axis === "y") {
      style.setProperty("--overscroll-y", offset);
      style.setProperty("--overscroll-x", "0px");
    } else {
      style.setProperty("--overscroll-x", offset);
      style.setProperty("--overscroll-y", "0px");
    }

    const clear = (): void => {
      el.classList.remove(BUMP_CLASS);
      style.removeProperty("--overscroll-x");
      style.removeProperty("--overscroll-y");
      window.clearTimeout(fallback);
    };

    el.addEventListener("animationend", clear, { once: true });
    // Safety net only — if `animationend` somehow never fires we still clean up.
    const fallback = window.setTimeout(clear, BUMP_FALLBACK_MS);
    el.classList.add(BUMP_CLASS);
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

  window.addEventListener("wheel", onWheel, { passive: true });
  window.addEventListener("scroll", onScroll, { capture: true, passive: true });
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: true });

  return () => {
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("scroll", onScroll, { capture: true });
    window.removeEventListener("touchstart", onTouchStart);
    window.removeEventListener("touchmove", onTouchMove);
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (rearmTimer !== null) window.clearTimeout(rearmTimer);
  };
}
