import type {
  DriverState,
  TransportDriver,
} from "@plugins/apps/plugins/sonata/plugins/session/web";
import {
  createMediaClock,
  type YouTubePlayerController,
} from "@plugins/integrations/plugins/youtube/web";

/**
 * The YouTube player as the session's transport driver: the medium owns the
 * position, so the cursor, the synth and the loop follow the video.
 *
 * - `position()` is the controller's playhead through a media clock (smoothed,
 *   so the synth resyncs on real slips, not iframe jitter), minus the sync
 *   offset; `null` unless the video is strictly playing.
 * - The state maps the player's: playing → advancing, buffering → stalled,
 *   anything else that is ready (paused, cued, ended) → paused, a refused video
 *   → failed.
 *
 * `offsetSec` is read on every call, so the mix's sync offset applies live. A
 * positive offset makes the transport (cursor and synth) trail the video's
 * reported time — the iframe's sound comes out late — and a seek adds it back.
 */
export function createVideoDriver(
  controller: YouTubePlayerController,
  offsetSec: () => number,
): TransportDriver {
  const clock = createMediaClock(controller);

  const state = (): DriverState => {
    const snapshot = controller.getSnapshot();
    if (snapshot.kind === "error") {
      return {
        kind: "failed",
        reason: `YouTube refused the video (error ${snapshot.code})`,
      };
    }
    if (snapshot.kind !== "ready") return { kind: "paused" };
    if (controller.isAdvancing) return { kind: "advancing" };
    if (controller.isPlaying) return { kind: "stalled" };
    return { kind: "paused" };
  };

  // The driver is registered only while the player is ready, but its
  // unregistering and the player's teardown run in separate effects; a
  // transport call landing between the two is dropped rather than thrown by a
  // controller that has no player any more.
  const attached = () => controller.getSnapshot().kind !== "loading";

  return {
    position() {
      const media = clock.position();
      return media === null ? null : media - offsetSec();
    },
    play() {
      if (attached()) controller.play();
    },
    pause() {
      if (attached()) controller.pause();
    },
    seek(mediaSec) {
      if (attached()) controller.seek(Math.max(0, mediaSec + offsetSec()));
    },
    setRate(rate) {
      return controller.setPlaybackRate(rate);
    },
    subscribe(listener) {
      let last = state();
      listener(last);
      return controller.subscribe(() => {
        // The player detaching (its element unmounting) is the medium going
        // away, not a pause: say nothing, the session unregisters the driver.
        if (!attached()) return;
        const next = state();
        if (next.kind === last.kind) return;
        last = next;
        listener(next);
      });
    },
  };
}
