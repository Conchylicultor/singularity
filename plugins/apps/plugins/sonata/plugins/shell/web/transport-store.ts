/**
 * A module-level command bus exposing the *active* Sonata transport to code that
 * runs outside React — chiefly global keyboard shortcuts (`defineShortcut`
 * handlers fire from a window listener, with no access to context).
 *
 * `SonataProvider` publishes its live actions here while mounted and clears them
 * on unmount. Since `AppsLayout` mounts only the active app, a non-null value
 * doubles as "the Sonata app is open" — the natural `when` guard for shortcuts.
 * Mirrors the reorder edit-mode module-store pattern (no React Context leak).
 */

/** The transport verbs the Sonata app publishes for out-of-React callers. */
export interface SonataTransportActions {
  /** Toggle play/pause from the current cursor. */
  togglePlay: () => void;
  /** Move the playhead by `deltaBeat` quarter-note beats (clamped to the score). */
  seekBy: (deltaBeat: number) => void;
  /** Adjust the playback tempo scale by `delta` (e.g. +0.1 = 10% faster). */
  nudgeTempo: (delta: number) => void;
}

let current: SonataTransportActions | null = null;

/** Called by `SonataProvider`: publish its actions on mount, `null` on unmount. */
export function publishSonataTransport(
  actions: SonataTransportActions | null,
): void {
  current = actions;
}

/** The active Sonata transport, or `null` when the Sonata app isn't mounted. */
export function getSonataTransport(): SonataTransportActions | null {
  return current;
}
