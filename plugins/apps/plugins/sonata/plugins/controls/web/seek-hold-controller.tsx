import { useEffect } from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import {
  getFocusedSurfaceId,
  isEditableTarget,
} from "@plugins/primitives/plugins/shortcuts/web";
import { useSurfaceTabId } from "@plugins/primitives/plugins/surface-id/web";
import { useSonata } from "@plugins/apps/plugins/sonata/plugins/shell/web";

/**
 * Headless ←/→ seek controller (a `Sonata.Effect`, so it mounts once per Sonata
 * surface inside `SonataProvider`). It owns the arrow keys directly rather than
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
 * registry), it must enforce focus and the "player on screen" gate itself:
 *
 *  - **Focus** — it bails unless THIS surface is the focused one
 *    (`getFocusedSurfaceId()`), so an arrow-key hold in a foreground window can't
 *    scrub a background Sonata window (the cross-window bug the transport bus had).
 *  - **Song** — it bails when no song is open (`currentSongId == null`). The old
 *    transport bus was empty on the library; `SonataProvider` now wraps both
 *    library and player, so this gate is restored explicitly.
 *
 * Plain arrow presses are claimed (and `preventDefault`'d so the page doesn't
 * scroll) only when no text field is focused; inside an input the arrows move
 * the caret as usual.
 */
export function SeekHoldController() {
  const { seekBar, startScrub, endScrub, currentSongId } = useSonata();
  const surfaceId = useSurfaceTabId();

  // The window listeners are installed once; read the live transport verbs,
  // surface id, and song-open gate through refs so the effect closure never goes
  // stale and we never re-install the listeners (which would drop an in-flight
  // hold). `useSonata()` verbs are referentially stable, but the song-open gate
  // is not — refs keep the single listener correct across opens.
  const seekBarRef = useLatestRef(seekBar);
  const startScrubRef = useLatestRef(startScrub);
  const endScrubRef = useLatestRef(endScrub);
  const surfaceIdRef = useLatestRef(surfaceId);
  const hasSongRef = useLatestRef(currentSongId != null);

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
      // Only the focused surface, and only when a song is open here.
      if (getFocusedSurfaceId() !== surfaceIdRef.current) return;
      if (!hasSongRef.current) return;
      if (isEditableTarget(e.target)) return; // let the field move its caret
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

    window.addEventListener("keydown", onKeyDown);
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
  }, [seekBarRef, startScrubRef, endScrubRef, surfaceIdRef, hasSongRef]);

  return null;
}
