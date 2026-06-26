/**
 * Framework-free core for the overscroll hint.
 *
 * Gives the app a native-feeling elastic **rubber-band** when a wheel /
 * trackpad / touch gesture is fully **wasted** — nothing actually scrolls
 * because the surface isn't scrollable or is already pinned at the edge in that
 * direction. Like iOS/macOS overscroll, the content follows the gesture *live*.
 *
 * We translate the viewport's CONTENT (its element children), never the viewport
 * box itself. Moving the box would drag its clip boundary over adjacent chrome
 * (a toolbar/footer) and, because `transform` opens a stacking context, paint
 * the overscrolled content *above* that chrome. Moving the content instead keeps
 * the bounce inside the viewport's own `overflow` clip — the native model: the
 * viewport stays put and clips, only the content inside it moves.
 *
 * The motion is a small continuous physics loop rather than a one-shot clip:
 *   - every wasted scroll event PUSHES the surface out, with resistance that
 *     grows as it nears the limit (so it asymptotes instead of running away);
 *   - every animation frame a spring-like DECAY pulls it back toward rest.
 * As trackpad momentum decays, the incoming pushes shrink, the decay wins, and
 * the surface recedes smoothly — it never stays pinned waiting for the momentum
 * tail to end. A fresh flick re-pushes it naturally, so repeated dead-end
 * scrolls always produce feedback. While a finger is down the decay pauses so
 * the surface tracks the touch 1:1, then springs back on release.
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
/** The furthest the surface can rubber-band, in px (the resistance asymptote). */
const MAX_PULL = 48;
/**
 * Fraction of a wasted scroll delta that becomes outward displacement at rest.
 * Resistance scales this down toward 0 as the offset nears MAX_PULL, so a hard
 * flick reaches the limit in a few events and pushing further barely moves it.
 */
const PUSH_FACTOR = 0.32;
/**
 * Spring-back time constant (ms). Each frame the offset is multiplied by
 * exp(-dt / DECAY_TAU_MS); ~3·τ (~270ms) returns it essentially to rest. Small
 * enough to feel snappy, large enough to read as a spring rather than a cut.
 */
const DECAY_TAU_MS = 90;
/** Below this |offset| (px) we snap to 0 and stop the loop. */
const STOP_EPS = 0.4;
/** Clamp for a single frame's dt so a backgrounded tab can't teleport the decay. */
const MAX_FRAME_MS = 64;
const SCROLLABLE_OVERFLOW = new Set(["auto", "scroll", "overlay"]);

/**
 * Install the global wasted-scroll detector. Returns a cleanup function that
 * removes every listener, cancels pending frames, and resets any surface left
 * mid-rubber-band.
 */
export function installOverscrollHint(): () => void {
  let pending: PendingGesture | null = null;
  let rafId: number | null = null;

  // Physics state for the surface currently being rubber-banded. `el` is the
  // scroll viewport we locked onto (kept for identity/axis tracking); `targets`
  // are the viewport's CONTENT layers (its element children) we actually
  // translate. Moving the content — not the viewport box — means the viewport's
  // own `overflow` clips the bounce, so the rubber-band can never slide its clip
  // boundary over adjacent chrome (a toolbar/footer) or paint above it via a
  // transform-induced stacking context. This is the native model: the viewport
  // stays put and clips; only the content inside it moves.
  let el: HTMLElement | null = null;
  let targets: HTMLElement[] = [];
  let axis: Axis = "y";
  let offset = 0; // current signed displacement in px
  let touching = false; // finger down → hold (no decay) so it tracks 1:1
  let loopId: number | null = null;
  let lastTs: number | null = null;

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

    const gestureAxis: Axis =
      Math.abs(gesture.deltaX) > Math.abs(gesture.deltaY) ? "x" : "y";
    const delta = gestureAxis === "x" ? gesture.deltaX : gesture.deltaY;
    if (delta === 0) return;
    if (reducedMotion()) return;

    const surface = pickScrollSurface(
      gesture.target instanceof Element ? gesture.target : null,
      gestureAxis,
    );
    if (!(surface instanceof HTMLElement)) return;

    // Switching surface or axis mid-flight: reset the old one cleanly.
    if (el && (el !== surface || axis !== gestureAxis)) {
      resetSurface();
    }

    // Translate the viewport's content layers, not the viewport itself. A
    // viewport with no element children (only text/pseudo content) has nothing
    // to bounce safely, so we skip rather than fall back to moving the box.
    const content = contentLayers(surface);
    if (content.length === 0) return;

    el = surface;
    targets = content;
    axis = gestureAxis;
    for (const t of targets) t.style.willChange = "transform";

    push(delta);
    apply();
    startLoop();
  }

  /**
   * Add a wasted scroll delta as outward displacement. Scrolling down/right at a
   * dead end nudges content UP/LEFT (positive delta → negative offset), like
   * native overscroll. Resistance shrinks the contribution as we near the limit.
   */
  function push(delta: number): void {
    const resistance = 1 - Math.abs(offset) / MAX_PULL;
    offset += -delta * PUSH_FACTOR * resistance;
    if (offset > MAX_PULL) offset = MAX_PULL;
    else if (offset < -MAX_PULL) offset = -MAX_PULL;
  }

  function apply(): void {
    if (targets.length === 0) return;
    const value =
      axis === "y" ? `translateY(${offset}px)` : `translateX(${offset}px)`;
    for (const t of targets) t.style.transform = value;
  }

  function startLoop(): void {
    if (loopId === null) {
      lastTs = null;
      loopId = requestAnimationFrame(step);
    }
  }

  function step(ts: number): void {
    loopId = null;
    if (!el) return;

    const dt = lastTs === null ? 16 : Math.min(MAX_FRAME_MS, ts - lastTs);
    lastTs = ts;

    // Finger down → hold the current displacement; otherwise spring back.
    if (!touching) {
      offset *= Math.exp(-dt / DECAY_TAU_MS);
      if (Math.abs(offset) < STOP_EPS) {
        offset = 0;
        apply();
        resetSurface();
        return;
      }
    }

    apply();
    loopId = requestAnimationFrame(step);
  }

  function resetSurface(): void {
    if (loopId !== null) {
      cancelAnimationFrame(loopId);
      loopId = null;
    }
    for (const t of targets) {
      t.style.transform = "";
      t.style.willChange = "";
    }
    targets = [];
    el = null;
    offset = 0;
    lastTs = null;
  }

  /**
   * The viewport's content layers — its direct element children. Translating
   * these (instead of the viewport box) keeps the bounce inside the viewport's
   * `overflow` clip, so it never escapes over adjacent chrome. Text/pseudo
   * children are skipped (only an element can carry a transform).
   */
  function contentLayers(surface: HTMLElement): HTMLElement[] {
    return Array.from(surface.children).filter(
      (c): c is HTMLElement => c instanceof HTMLElement,
    );
  }

  function pickScrollSurface(start: Element | null, ax: Axis): Element | null {
    const overflowProp = ax === "x" ? "overflow-x" : ("overflow-y" as const);
    let node: Element | null = start;
    while (node) {
      const overflow = getComputedStyle(node).getPropertyValue(overflowProp);
      if (SCROLLABLE_OVERFLOW.has(overflow.trim())) return node;
      node = node.parentElement;
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
    touching = true;
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
    // Finger released → resume the spring-back from wherever it was held.
    touching = false;
    if (el) startLoop();
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
    resetSurface();
  };
}
