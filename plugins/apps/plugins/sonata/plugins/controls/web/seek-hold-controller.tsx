import { useEffect } from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import {
  getFocusedSurfaceId,
  targetClaimsKey,
} from "@plugins/primitives/plugins/shortcuts/web";
import { useSurfaceTabId } from "@plugins/primitives/plugins/scope/plugins/surface-id/web";
import { useSession } from "@plugins/apps/plugins/sonata/plugins/session/web";

/**
 * Headless ←/→ seek controller (a `SonataPlayer.Effect`, so it mounts once per
 * player while that player is shown — the Sonata app's player pane or a file
 * preview, never the library's now-playing bar). It owns the arrow keys directly rather than
 * going through the keydown-only shortcut registry, because good seek UX needs to
 * tell a *tap* from a *press-and-hold*, which requires both keyup and the OS
 * auto-repeat signal:
 *
 *  - **Tap** (a single keydown) → jump to the previous / next bar line: one
 *    press rewinds / advances a whole measure (Synthesia-style), an immediate
 *    meaningful jump rather than a tiny step.
 *  - **Hold** (auto-repeat keydowns start arriving) → escalate to a bar-by-bar
 *    repeat at an accelerating cadence until release, with the audio scheduler
 *    suspended for the duration (so the rapid stepping never flickers).
 *
 * Because it runs from a raw window listener (not the surface-scoped shortcut
 * registry), it must enforce what the registry would itself:
 *
 *  - **Focus** — it bails unless THIS surface is the focused one
 *    (`getFocusedSurfaceId()`), so an arrow-key hold in a foreground window can't
 *    scrub a background player (the cross-window bug the transport bus had).
 *  - **Handled keys** — it bails on an event an element already handled
 *    (`defaultPrevented`): a file tree or list moving its selection with the
 *    arrows owns them.
 *  - **Text fields** — inside an input the arrows move the caret / thumb
 *    (`targetClaimsKey`).
 *
 * Otherwise the press is claimed (and `preventDefault`'d so the page doesn't
 * scroll).
 */
export function SeekHoldController() {
  const { seekBar, startScrub, endScrub } = useSession();
  const surfaceId = useSurfaceTabId();

  // The window listeners are installed once; read the live transport verbs and
  // surface id through refs so the effect closure never goes stale and we never
  // re-install the listeners (which would drop an in-flight hold).
  const seekBarRef = useLatestRef(seekBar);
  const startScrubRef = useLatestRef(startScrub);
  const endScrubRef = useLatestRef(endScrub);
  const surfaceIdRef = useLatestRef(surfaceId);

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
      // Only the focused surface, and only a key nothing else handled.
      if (getFocusedSurfaceId() !== surfaceIdRef.current) return;
      if (e.defaultPrevented) return;
      if (targetClaimsKey(e)) return; // let the field move its caret / thumb
      e.preventDefault();

      if (e.repeat) {
        // OS auto-repeat = the key is being held: escalate to a smooth scrub
        // (once — further repeats are absorbed by the running scrub loop).
        if (!scrubbing) {
          scrubbing = true;
          startScrubRef.current(direction);
        }
        return;
      }

      // Initial press: jump one bar immediately so a quick tap is crisp. If the
      // key keeps being held, the first auto-repeat above takes over from here.
      heldKey = e.key as "ArrowLeft" | "ArrowRight";
      seekBarRef.current(direction);
    };

    const release = (key: string) => {
      if (key !== heldKey) return;
      heldKey = null;
      if (scrubbing) {
        scrubbing = false;
        endScrubRef.current();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => release(e.key);
    // A held key whose window loses focus never fires keyup — end the scrub so
    // it can't run away.
    const onBlur = () => {
      if (heldKey) release(heldKey);
    };

    // eslint-disable-next-line shortcuts/no-window-key-listener -- tap-vs-hold seeking needs keyup + auto-repeat, which the keydown-only registry can't express; the handler gates on the focused surface itself (see the doc above).
    window.addEventListener("keydown", onKeyDown);
    // eslint-disable-next-line shortcuts/no-window-key-listener -- the keyup half of the tap-vs-hold seek above; it only ends a hold this surface's keydown started.
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      // Unmounting mid-hold (app closed) must not strand a running scrub.
      // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional latest-value read at cleanup: endScrubRef (a useLatestRef) must call the CURRENT endScrub verb, not one snapshotted at effect-setup, so an instrument/song swap mid-hold still ends the right scrub.
      if (scrubbing) endScrubRef.current();
    };
    // Install the window listeners once: every live value (transport verbs,
    // surface id) is read off its stable useLatestRef handle, so the
    // effect never re-runs and an in-flight hold is never dropped.
  }, []);

  return null;
}
