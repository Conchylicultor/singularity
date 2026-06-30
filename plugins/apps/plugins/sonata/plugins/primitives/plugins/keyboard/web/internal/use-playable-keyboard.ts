import { type PointerEvent as ReactPointerEvent, useRef } from "react";
import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";

/**
 * Opt-in playability for the keyboard primitive: press/release callbacks the
 * keyboard fires as the user clicks / taps / drags across keys. Kept generic —
 * the keyboard knows pitches, the consumer owns the sound.
 */
export interface KeyboardInteraction {
  onPress(pitch: number): void;
  onRelease(pitch: number): void;
}

type PointerHandlers = {
  onPointerDown(e: ReactPointerEvent): void;
  onPointerMove(e: ReactPointerEvent): void;
  onPointerUp(e: ReactPointerEvent): void;
  onPointerCancel(e: ReactPointerEvent): void;
};

/** The MIDI pitch of the key under a viewport point, or null over no key. The
 *  hit-test reads `data-pitch` off the topmost element, so black-over-white
 *  stacking resolves correctly for free (the raised black key wins). */
function pitchAt(clientX: number, clientY: number): number | null {
  const el = document.elementFromPoint(clientX, clientY)?.closest?.("[data-pitch]");
  return el ? Number((el as HTMLElement).dataset.pitch) : null;
}

/**
 * Returns the pointer-handler props to spread onto the keyboard root, or `{}`
 * when `interaction` is undefined (so the keyboard stays a pure display in its
 * readout/chord uses). Tracks one note per `pointerId` so multi-touch and
 * glissando (sliding across keys) fall out naturally; handlers are stable
 * (`useEventCallback`) and always see the latest `interaction`.
 */
export function usePlayableKeyboard(
  interaction?: KeyboardInteraction,
): Partial<PointerHandlers> {
  // pointerId → the pitch that pointer is currently holding.
  const activeRef = useRef<Map<number, number>>(new Map());

  const onPointerDown = useEventCallback((e: ReactPointerEvent) => {
    if (!interaction) return;
    // Avoid focus/selection so a drag glissando doesn't select text.
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pitchAt(e.clientX, e.clientY);
    if (p == null) return;
    activeRef.current.set(e.pointerId, p);
    interaction.onPress(p);
  });

  const onPointerMove = useEventCallback((e: ReactPointerEvent) => {
    if (!interaction) return;
    if (!activeRef.current.has(e.pointerId)) return;
    const cur = activeRef.current.get(e.pointerId);
    const next = pitchAt(e.clientX, e.clientY);
    if (next === cur) return;
    if (cur != null) interaction.onRelease(cur);
    if (next != null) {
      interaction.onPress(next);
      activeRef.current.set(e.pointerId, next);
    } else {
      activeRef.current.delete(e.pointerId);
    }
  });

  const endPointer = useEventCallback((e: ReactPointerEvent) => {
    if (!interaction) return;
    const cur = activeRef.current.get(e.pointerId);
    if (cur != null) interaction.onRelease(cur);
    activeRef.current.delete(e.pointerId);
  });

  if (!interaction) return {};
  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endPointer,
    onPointerCancel: endPointer,
  };
}
