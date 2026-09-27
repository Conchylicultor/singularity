/**
 * One per-song setting — transpose, key mode, chord mode, groove, track view —
 * as a Sonata surface holds it for the loaded song: `pending` until the feature
 * plugin that persists it has read that song's value, then the value.
 *
 * Not known yet is a STATE here, never a stand-in. The two stand-ins it
 * replaces were each wrong for a round trip: the setting's default (a muted
 * track sounds, a transposed song plays in its original key) and the previous
 * song's value (song B plays in song A's key). `SonataProvider` shows and plays
 * nothing of a song until every per-song setting registered in the running
 * composition has settled.
 */
export type SongSetting<T> = { pending: true } | { pending: false; value: T };

/**
 * A per-song setting's identity and value type. Its value lives in the loaded
 * song (`loaded-song.ts`), keyed by THIS OBJECT — so two settings can never
 * collide on a name. Defined once, by the plugin that reads it: the shell for
 * the settings its score pipeline transforms with, a feature plugin for one
 * only it reads (the track-mixer's track view).
 *
 * A setting is only waited on when the running composition registers it — a
 * `Sonata.SongSetting` contribution pairing it with the observer that settles
 * it for the loaded song.
 */
export interface SongSettingKey<T> {
  /** For messages only — identity is the object. */
  readonly name: string;
  /**
   * The song's value in a composition WITHOUT the feature that persists this
   * setting: the truth there, not a stand-in — with no transpose feature, no
   * song is transposed. A reader gets it only while nothing registers the
   * setting; a registered setting is pending until its observer settles it.
   */
  readonly absent: T;
}

export function defineSongSetting<T>(
  name: string,
  absent: T,
): SongSettingKey<T> {
  return { name, absent };
}
