import {
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const DEFAULT_CLOSE_DELAY = 150;

export interface DisclosureIntentProps {
  tabIndex: 0;
  "aria-expanded": boolean;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onPointerDown: () => void;
  onFocus: () => void;
  onBlur: (e: FocusEvent) => void;
  onKeyDown: (e: KeyboardEvent) => void;
}

export interface DisclosureIntent {
  open: boolean;
  rootProps: DisclosureIntentProps;
}

/**
 * Disclosure-intent state machine for a hover-revealed control.
 *
 * Three independent open sources, OR-ed together, so no single source can
 * suppress another:
 *   - hover    — opens on pointer-enter, closes on pointer-leave after a grace
 *                delay. Re-entry ALWAYS cancels the pending close, so returning
 *                to the trigger reliably reopens — there is no timer "lock" that
 *                swallows a genuine re-entry (the dead-zone bug this replaces).
 *   - focus    — opens while keyboard focus is anywhere inside the subtree, so
 *                the control is reachable by Tab, not mouse-only.
 *   - latch    — a pointer-press while fully closed (the touch path, where
 *                there is no hover) pins it open until Esc or an outside press.
 *                Presses while already open are left to bubble to the content,
 *                so tapping an item inside never toggles the panel shut.
 *
 * Flicker (rapid open/close as the morphing panel's geometry shifts under the
 * cursor) is handled structurally by the caller pinning a stable hover hitbox,
 * plus the grace delay here — never by ignoring input.
 */
export function useDisclosureIntent(
  rootRef: RefObject<HTMLElement | null>,
  closeDelay = DEFAULT_CLOSE_DELAY,
): DisclosureIntent {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [latched, setLatched] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const open = hovered || focused || latched;

  const onPointerEnter = useCallback(() => {
    clearTimeout(closeTimer.current);
    setHovered(true);
  }, []);

  const onPointerLeave = useCallback(() => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHovered(false), closeDelay);
  }, [closeDelay]);

  const onPointerDown = useCallback(() => {
    // Touch has no hover: the first press on a closed control opens it. While
    // already open, leave the press alone so it reaches the content.
    setLatched((latchedNow) => (open ? latchedNow : true));
  }, [open]);

  const onFocus = useCallback(() => {
    clearTimeout(closeTimer.current);
    setFocused(true);
  }, []);

  const onBlur = useCallback((e: FocusEvent) => {
    // Only collapse once focus has left the whole subtree, not when it moves
    // between the trigger and an item inside the panel.
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setFocused(false);
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.stopPropagation();
        clearTimeout(closeTimer.current);
        setHovered(false);
        setLatched(false);
      }
    },
    [open],
  );

  // An outside press dismisses a latched (touch / click) open. Hover and focus
  // opens dismiss themselves via pointer-leave / blur.
  useEffect(() => {
    if (!latched) return;
    const onDocPointerDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setLatched(false);
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [latched, rootRef]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  return {
    open,
    rootProps: {
      tabIndex: 0,
      "aria-expanded": open,
      onPointerEnter,
      onPointerLeave,
      onPointerDown,
      onFocus,
      onBlur,
      onKeyDown,
    },
  };
}
