import { useEffect } from "react";
import { isEditableTarget } from "@plugins/primitives/plugins/shortcuts/web";
import { getSonataTransport } from "@plugins/apps/plugins/sonata/plugins/shell/web";

/**
 * Headless ←/→ seek controller (a `Sonata.Effect`, so it is mounted exactly
 * while the Sonata app is open — the same implicit "player on screen" gate the
 * transport bus gives the other shortcuts).
 *
 * It owns the arrow keys directly rather than going through the keydown-only
 * shortcut registry, because good seek UX needs to tell a *tap* from a
 * *press-and-hold*, which requires both keyup and the OS auto-repeat signal:
 *
 *  - **Tap** (a single keydown) → jump to the previous / next bar line: one
 *    press rewinds / advances a whole measure (Synthesia-style), an immediate
 *    meaningful jump rather than a tiny step.
 *  - **Hold** (auto-repeat keydowns start arriving) → escalate to a bar-by-bar
 *    repeat at an accelerating cadence until release, with the audio scheduler
 *    suspended for the duration (so the rapid stepping never flickers).
 *
 * Plain arrow presses are claimed (and `preventDefault`'d so the page doesn't
 * scroll) only when no text field is focused; inside an input the arrows move
 * the caret as usual.
 */
export function SeekHoldController() {
  useEffect(() => {
    // The key currently driving a press (so keyup matches its own keydown) and
    // whether that press has escalated into a continuous scrub.
    let heldKey: "ArrowLeft" | "ArrowRight" | null = null;
    let scrubbing = false;

    const dirOf = (key: string): -1 | 1 | null =>
      key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : null;

    const onKeyDown = (e: KeyboardEvent) => {
      const direction = dirOf(e.key);
      if (direction === null) return;
      if (isEditableTarget(e.target)) return; // let the field move its caret
      const transport = getSonataTransport();
      if (!transport) return;
      e.preventDefault();

      if (e.repeat) {
        // OS auto-repeat = the key is being held: escalate to a smooth scrub
        // (once — further repeats are absorbed by the running scrub loop).
        if (!scrubbing) {
          scrubbing = true;
          transport.startScrub(direction);
        }
        return;
      }

      // Initial press: jump one bar immediately so a quick tap is crisp. If the
      // key keeps being held, the first auto-repeat above takes over from here.
      heldKey = e.key as "ArrowLeft" | "ArrowRight";
      transport.seekBar(direction);
    };

    const release = (key: string) => {
      if (key !== heldKey) return;
      heldKey = null;
      if (scrubbing) {
        scrubbing = false;
        getSonataTransport()?.endScrub();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => release(e.key);
    // A held key whose window loses focus never fires keyup — end the scrub so
    // it can't run away.
    const onBlur = () => {
      if (heldKey) release(heldKey);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      // Unmounting mid-hold (app closed) must not strand a running scrub.
      if (scrubbing) getSonataTransport()?.endScrub();
    };
  }, []);

  return null;
}
