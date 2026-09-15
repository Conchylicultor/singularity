import { useCallback, useEffect, useRef, useState } from "react";

export interface HoverIntentTiming {
  /** How long the pointer must rest on a trigger before the surface opens (ms). */
  openDelay: number;
  /** How long after the pointer leaves trigger AND surface the surface closes (ms). */
  closeDelay: number;
}

export interface HoverIntent<T> {
  /** The trigger the surface is open for, or null while closed. */
  active: T | null;
  /**
   * Pinned: the user committed to the surface (clicked into it — the link card's
   * Edit mode). Pointer movement no longer opens, switches or closes it; only
   * `close()` does.
   */
  pinned: boolean;
  /** The pointer came to rest on `trigger` (already filtered for held buttons). */
  enterTrigger: (trigger: T) => void;
  /** The pointer left the trigger it was on. */
  leaveTrigger: () => void;
  /** Drop a not-yet-fired open (a mouse button went down mid-dwell). */
  cancelPendingOpen: () => void;
  /** Spread onto the surface's content so travelling onto it keeps it open. */
  surfaceProps: {
    onPointerEnter: () => void;
    onPointerLeave: () => void;
  };
  pin: () => void;
  close: () => void;
}

interface State<T> {
  active: T | null;
  pinned: boolean;
}

const CLOSED = { active: null, pinned: false } as const;

/**
 * Hover intent for ONE surface shared by MANY triggers — the link hover card,
 * where every `<a>` in a block is a trigger for the same card.
 *
 * The rules, all of which live here and nowhere else:
 *  - **Open on dwell.** The surface opens `openDelay` after the pointer comes to
 *    rest on a trigger, so sweeping the pointer across a paragraph opens
 *    nothing. Leaving before then cancels it.
 *  - **Close on leave, with grace.** It closes `closeDelay` after the pointer
 *    has left both the trigger and the surface. Entering either cancels the
 *    close — that grace is what lets the pointer cross the gap from the link
 *    onto the card.
 *  - **Switch on dwell.** Resting on a DIFFERENT trigger while open re-targets
 *    the surface after the same `openDelay`; the old one stays up until then.
 *  - **Pinned ignores the pointer.** Once pinned, only `close()` ends it.
 *
 * "Never while a mouse button is held" is the CALLER's filter (it has the
 * event): it simply doesn't report a trigger entered with a button down, and
 * calls `cancelPendingOpen` when a press lands mid-dwell.
 *
 * Why not `useDisclosureIntent` (primitives/overlay/floating-action): that one
 * binds ONE trigger element's own handlers, and adds focus + touch-latch open
 * sources a text link must not have (a caret moving into a link is not a
 * request to see its card). The timers here are one-shot delays, not a poll.
 */
export function useHoverIntent<T>(
  isSame: (a: T, b: T) => boolean,
  { openDelay, closeDelay }: HoverIntentTiming,
): HoverIntent<T> {
  const [state, setState] = useState<State<T>>(CLOSED);
  // The callbacks below run from native listeners and timers, so they read the
  // live state through this mirror; it is only ever written next to `setState`.
  const stateRef = useRef<State<T>>(CLOSED);
  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const commit = useCallback((next: State<T>) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const clearTimers = useCallback(() => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
  }, []);

  const scheduleClose = useCallback(() => {
    const { active, pinned } = stateRef.current;
    if (pinned || active === null) return;
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => commit(CLOSED), closeDelay);
  }, [closeDelay, commit]);

  const enterTrigger = useCallback(
    (trigger: T) => {
      const { active, pinned } = stateRef.current;
      if (pinned) return;
      clearTimeout(closeTimer.current);
      if (active !== null && isSame(active, trigger)) return;
      clearTimeout(openTimer.current);
      openTimer.current = setTimeout(
        () => commit({ active: trigger, pinned: false }),
        openDelay,
      );
    },
    [isSame, openDelay, commit],
  );

  const leaveTrigger = useCallback(() => {
    clearTimeout(openTimer.current);
    scheduleClose();
  }, [scheduleClose]);

  const cancelPendingOpen = useCallback(() => {
    clearTimeout(openTimer.current);
  }, []);

  const onSurfaceEnter = useCallback(() => {
    clearTimeout(closeTimer.current);
  }, []);

  const pin = useCallback(() => {
    const { active } = stateRef.current;
    if (active === null) return;
    clearTimers();
    commit({ active, pinned: true });
  }, [clearTimers, commit]);

  const close = useCallback(() => {
    clearTimers();
    if (stateRef.current.active !== null) commit(CLOSED);
  }, [clearTimers, commit]);

  useEffect(() => clearTimers, [clearTimers]);

  return {
    active: state.active,
    pinned: state.pinned,
    enterTrigger,
    leaveTrigger,
    cancelPendingOpen,
    surfaceProps: {
      onPointerEnter: onSurfaceEnter,
      onPointerLeave: scheduleClose,
    },
    pin,
    close,
  };
}
