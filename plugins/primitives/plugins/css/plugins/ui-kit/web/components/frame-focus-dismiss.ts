import * as React from "react";

/**
 * Closes an open popup when the user clicks into an `<iframe>`.
 *
 * base-ui dismisses on an outside press by listening for pointer events on
 * the app's document. A click inside an iframe lands in the iframe's own
 * document, so the app never hears it and the popup stays open over, say, a
 * prototype the user just clicked back into. What the app DOES see is its
 * window losing focus with the iframe as the new active element — that is the
 * signal used here. Switching browser tabs also blurs the window, but leaves
 * the active element where it was, so it does not close anything.
 *
 * Returns the `actionsRef` to hand to the base-ui `Root`.
 */
export function useFrameFocusDismiss<Actions extends { close: () => void }>(
  open: boolean,
): React.RefObject<Actions | null> {
  const actionsRef = React.useRef<Actions | null>(null);
  React.useEffect(() => {
    if (!open) return;
    const onBlur = (): void => {
      if (document.activeElement instanceof HTMLIFrameElement) {
        actionsRef.current?.close();
      }
    };
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("blur", onBlur);
    };
  }, [open]);
  return actionsRef;
}
