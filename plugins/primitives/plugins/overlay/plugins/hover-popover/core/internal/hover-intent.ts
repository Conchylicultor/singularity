export interface HoverIntentOptions {
  /**
   * How long the pointer must stay before `onOpen` fires, in ms. `0` opens on
   * arrival (synchronously), for a control whose reveal IS the hover.
   */
  openDelay: number;
  /** The grace between the pointer leaving and `onClose`, in ms. */
  closeDelay: number;
  onOpen: () => void;
  onClose: () => void;
}

/**
 * The hover half of a disclosure: one pending timer, driven by the pointer
 * arriving at and leaving its hover zones.
 *
 * - `enter()` cancels a pending close — ALWAYS, so returning to the zone
 *   reliably keeps it open (no timer "lock" swallowing a genuine re-entry) —
 *   and schedules the open.
 * - `leave()` cancels a pending open — a pointer that only passed over the
 *   trigger never opens it — and schedules the close after the grace.
 *
 * A disclosure with SEVERAL zones (a trigger and the panel portaled away from
 * it) feeds every zone's enter/leave into one intent: crossing the gap between
 * them is a leave followed, within the grace, by an enter, so the panel stays
 * open exactly while the pointer is on either one.
 *
 * Framework-free: the timers are the only state, so the React hooks that own a
 * disclosure's open flags (hover-popover, floating-action) share one statement
 * of the timing instead of each re-deriving it.
 */
export interface HoverIntent {
  enter(): void;
  leave(): void;
  /** Drop whatever is pending without opening or closing (focus took over, Esc, unmount). */
  cancel(): void;
}

export function createHoverIntent({
  openDelay,
  closeDelay,
  onOpen,
  onClose,
}: HoverIntentOptions): HoverIntent {
  let pending: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    clearTimeout(pending);
    pending = undefined;
  };
  return {
    enter() {
      cancel();
      if (openDelay <= 0) {
        onOpen();
        return;
      }
      pending = setTimeout(() => {
        pending = undefined;
        onOpen();
      }, openDelay);
    },
    leave() {
      cancel();
      pending = setTimeout(() => {
        pending = undefined;
        onClose();
      }, closeDelay);
    },
    cancel,
  };
}
