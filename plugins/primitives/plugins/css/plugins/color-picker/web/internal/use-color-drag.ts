import { useCallback } from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";

export function useColorDrag(
  elRef: React.RefObject<HTMLElement | null>,
  onChange: (x: number, y: number) => void,
): { onPointerDown: React.PointerEventHandler } {
  const cbRef = useLatestRef(onChange);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const el = elRef.current;
      if (!el) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);

      const emit = (ev: { clientX: number; clientY: number }) => {
        const rect = el.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (ev.clientY - rect.top) / rect.height));
        cbRef.current(x, y);
      };

      emit(e);

      const onMove = (ev: PointerEvent) => emit(ev);
      const onUp = () => {
        el.removeEventListener("pointermove", onMove);
        el.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
      };

      el.addEventListener("pointermove", onMove);
      el.addEventListener("pointerup", onUp);
      el.addEventListener("pointercancel", onUp);
    },
    // `cbRef` is a stable useLatestRef handle (identity never changes); listed
    // only to satisfy exhaustive-deps. `onPointerDown` stays stable and reads the
    // freshest `onChange` off `cbRef.current` at emit time.
    [elRef, cbRef],
  );

  return { onPointerDown };
}
