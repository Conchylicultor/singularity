import {
  defineMountSlot,
  defineWrapperSlot,
} from "@plugins/primitives/plugins/slot-render/web";

/**
 * The playback session's extension points — scoped to ONE session (a Sonata
 * window, or any other host that mounts a player scope), not to the Sonata app.
 * A contribution here runs wherever a song is played, so it may read only the
 * session (`useSession`, the cursor hooks) and the song document — never the
 * Sonata app's state (the open song, the library), which a non-app host has
 * not got.
 */
export const SonataSession = {
  // PROVIDER — per-session React context wrappers folded around the session's
  // children (inside the session, so a wrapper may `useSession()`). Lets a
  // plugin the player scope can't import (a cycle) inject ONE provider above
  // the session's whole subtree — so sibling consumers in different slot
  // branches (an audio engine and its volume control) share one per-session
  // store, and two sessions stay independent. Contributions nest outside-in in
  // contribution order; the slot paints nothing itself.
  Provider: defineWrapperSlot(),

  // EFFECT — headless, always-mounted per-session side effects that render
  // nothing (the audio engine, the live player, the metronome). Mounted once
  // inside the session's providers, so they observe the transport whatever
  // the host shows. Effects that should run only while a player is on screen
  // (the keyboard transport) are the player's `SonataPlayer.Effect`; app-only
  // effects (play history, tempo keys) belong in the shell's `Sonata.Effect`.
  Effect: defineMountSlot({
    docLabel: (p) => p.id,
  }),
};
