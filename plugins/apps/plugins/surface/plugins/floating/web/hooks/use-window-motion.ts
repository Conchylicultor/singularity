import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import {
  consumeWindowIntro,
  type FloatingWindow,
  type WindowId,
} from "./use-floating-windows";
import { snapBox } from "./use-snap";

/**
 * Window motion — the presentational animation layer for floating windows.
 *
 * The desktop has no native window animations: a snap/maximize/restore jumps the
 * box, a minimize blinks the window out, and a freshly-opened window pops in
 * instantly. This module gives those state changes motion WITHOUT touching the
 * geometry store (which stays the single source of truth for the box). It owns
 * three things:
 *
 *  1. A transient **interaction** channel (a module-global set of windows being
 *     pointer-dragged/resized) so the box `transition` is suppressed during
 *     direct manipulation — a window must track the cursor 1:1, never lag behind
 *     a 200ms ease. Released over a snap zone, the interaction ends in the same
 *     commit the snapped box is written, so the snap itself animates.
 *  2. A **reduced-motion** read, so every animation degrades to the old instant
 *     behaviour under `prefers-reduced-motion: reduce`.
 *  3. {@link useFloatingWindowStyle}: the per-window phase machine that derives
 *     the animated container style (box + transform + opacity + transition),
 *     pushed onto the keep-alive container by the chrome.
 *
 * All motion is expressed as inline `transition`/`transform` on the box style the
 * chrome already pushes — no keyframes, no extra DOM, no change to the generic
 * surface body.
 */

/** Box geometry tween (snap / maximize / restore expand-contract). */
const BOX_MS = 200;
/** Window open (intro) + minimize-restore enter tween. */
const ENTER_MS = 190;
/** Minimize-to-dock exit tween. */
const MINIMIZE_MS = 200;

/** Decelerate curve for box + enter motion (Material "standard decelerate"). */
const EASE_OUT = "cubic-bezier(0.2, 0, 0, 1)";
/** Accelerate curve for the minimize exit, so the window "drops" into the dock. */
const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";

/**
 * The transform a window animates toward when minimizing (and away from when
 * restoring): shrunk and slid downward toward the bottom-centered dock, scaled
 * about its bottom edge so it visually "falls" into the taskbar. Horizontal aim
 * is left at the window's own column (a true genie toward the exact dock chip
 * would couple the chrome to the dock's DOM); vertical drop + scale + fade reads
 * as a deliberate minimize without that coupling.
 */
const MINIMIZED_TRANSFORM = "translateY(40%) scale(0.2)";
const MINIMIZED_ORIGIN = "bottom center";

// ---------------------------------------------------------------------------
// Interaction channel — windows currently being pointer-dragged or resized.
// Module-global by design, mirroring this plugin's other transient channels
// (geometry, snap preview): the writer (chrome drag handlers) and reader
// (the style hook) live in the same single focused floating surface.
// ---------------------------------------------------------------------------

// eslint-disable-next-line scoped-store/no-module-mutable-store -- page-global by design: a transient set of windows under active pointer drag/resize, shared between the chrome's drag handlers and the per-window style hook (mirrors this plugin's module-global geometry + snap-preview channels).
const interacting = new Set<WindowId>();
const interactionSubs = new Set<() => void>();

function notifyInteraction() {
  for (const fn of interactionSubs) fn();
}

/** Mark a window as under active pointer manipulation (drag / resize start). */
export function beginWindowInteraction(id: WindowId) {
  if (interacting.has(id)) return;
  interacting.add(id);
  notifyInteraction();
}

/** Clear a window's active-manipulation flag (drag / resize end). */
export function endWindowInteraction(id: WindowId) {
  if (!interacting.delete(id)) return;
  notifyInteraction();
}

/** Reactive read: is this window being pointer-dragged/resized right now? */
function useWindowInteracting(id: WindowId): boolean {
  return useSyncExternalStore(
    (cb) => {
      interactionSubs.add(cb);
      return () => interactionSubs.delete(cb);
    },
    () => interacting.has(id),
    () => false,
  );
}

// ---------------------------------------------------------------------------
// Reduced motion.
// ---------------------------------------------------------------------------

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

// ---------------------------------------------------------------------------
// Per-window style machine.
// ---------------------------------------------------------------------------

/**
 * Animation phase of one window's visible chrome. Resting phases (`normal`,
 * `minimized`) hold a static style; the three transient phases run a one-shot
 * tween then settle:
 *  - `intro`     — opening pop (scale-in + fade), settles to `normal`.
 *  - `minimizing`— exit toward the dock, settles to `minimized` (display:none).
 *  - `restoring` — reverse of minimizing, settles to `normal`.
 */
type Phase = "intro" | "normal" | "minimizing" | "minimized" | "restoring";

export interface WindowStyle {
  /** The animated container box style (pushed onto the keep-alive container). */
  containerStyle: CSSProperties;
  /** Whether the window is fully hidden (display:none) — drives the content inset. */
  hidden: boolean;
}

/**
 * Derive the animated container style for one floating window, given the window
 * and whether this tab is its shown member. Returns a memoized box style plus a
 * `hidden` flag; the chrome pushes the style onto the host container and uses
 * `hidden` to gate the content inset.
 *
 * Only the ACTIVE member animates: inactive group members (and reduced-motion)
 * collapse to the old instant show/hide. The box itself always comes from the
 * geometry store; this layer only adds `transition` (suppressed mid-drag) and the
 * transform/opacity of the open/minimize tweens on top.
 */
export function useFloatingWindowStyle(
  win: FloatingWindow,
  isActive: boolean,
): WindowStyle {
  const reduced = usePrefersReducedMotion();
  const dragging = useWindowInteracting(win.id);
  const geo = win.geo;

  // Open pop only for a genuinely fresh window (minted, not hydrated/merged) that
  // is the shown member — consumed once so a placement round-trip never re-plays.
  const [phase, setPhase] = useState<Phase>(() =>
    !reduced && isActive && consumeWindowIntro(win.id) ? "intro" : "normal",
  );
  // Two-step arm for the enter tweens (intro / restoring): render the "from"
  // transform first, then flip `play` on the next frame so the browser tweens to
  // the "to" transform.
  const [play, setPlay] = useState(false);
  // Box transitions arm only AFTER the first commit, so the window's initial
  // placement (mount / hydrate / placement switch) snaps in instead of sliding
  // from the previous box.
  const [boxReady, setBoxReady] = useState(false);

  const prevMinimized = useRef(geo.minimized);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setBoxReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // React to a minimize/restore flip. Reduced-motion (or an inactive member)
  // jumps straight to the resting phase; otherwise enter the matching tween.
  useEffect(() => {
    if (geo.minimized === prevMinimized.current) return;
    prevMinimized.current = geo.minimized;
    if (reduced || !isActive) {
      setPhase(geo.minimized ? "minimized" : "normal");
      return;
    }
    setPlay(false);
    setPhase(geo.minimized ? "minimizing" : "restoring");
  }, [geo.minimized, isActive, reduced]);

  // One-shot phase timers. A single deferred settle per transient phase (not a
  // polling loop): arm the enter "play" frame, then advance to the resting phase
  // once the tween's duration has elapsed.
  useEffect(() => {
    if (phase === "intro" || phase === "restoring") {
      const raf = requestAnimationFrame(() => setPlay(true));
      const t = setTimeout(() => setPhase("normal"), ENTER_MS + 40);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(t);
      };
    }
    if (phase === "minimizing") {
      const t = setTimeout(() => setPhase("minimized"), MINIMIZE_MS + 20);
      return () => clearTimeout(t);
    }
  }, [phase]);

  return useMemo<WindowStyle>(() => {
    const box: CSSProperties = geo.snap
      ? snapBox(geo.snap)
      : { left: geo.x, top: geo.y, width: geo.w, height: geo.h };

    // Fully hidden: an inactive member, a settled-minimized window, or a window
    // that is flagged minimized while resting (hydrated-minimized / reduced).
    const hidden =
      !isActive ||
      phase === "minimized" ||
      ((phase === "normal" || phase === "intro") && geo.minimized);

    let transform: string | undefined;
    let opacity: number | undefined;
    let transformOrigin: string | undefined;
    if (phase === "intro") {
      transform = play ? "scale(1)" : "scale(0.96)";
      opacity = play ? 1 : 0;
      transformOrigin = "center";
    } else if (phase === "minimizing") {
      transform = MINIMIZED_TRANSFORM;
      opacity = 0;
      transformOrigin = MINIMIZED_ORIGIN;
    } else if (phase === "restoring") {
      transform = play ? "translateY(0) scale(1)" : MINIMIZED_TRANSFORM;
      opacity = play ? 1 : 0;
      transformOrigin = MINIMIZED_ORIGIN;
    }

    const parts: string[] = [];
    if (boxReady && !dragging && !reduced && phase === "normal") {
      for (const p of ["left", "top", "width", "height"])
        parts.push(`${p} ${BOX_MS}ms ${EASE_OUT}`);
    }
    if (phase === "intro" || phase === "restoring")
      parts.push(
        `transform ${ENTER_MS}ms ${EASE_OUT}`,
        `opacity ${ENTER_MS}ms ${EASE_OUT}`,
      );
    if (phase === "minimizing")
      parts.push(
        `transform ${MINIMIZE_MS}ms ${EASE_IN}`,
        `opacity ${MINIMIZE_MS}ms ${EASE_IN}`,
      );

    const containerStyle: CSSProperties = {
      ...box,
      zIndex: geo.z,
      ...(hidden ? { display: "none" } : null),
      ...(transform ? { transform, willChange: "transform, opacity" } : null),
      ...(opacity !== undefined ? { opacity } : null),
      ...(transformOrigin ? { transformOrigin } : null),
      ...(parts.length ? { transition: parts.join(", ") } : null),
    };

    return { containerStyle, hidden };
  }, [geo, isActive, phase, play, boxReady, dragging, reduced]);
}
