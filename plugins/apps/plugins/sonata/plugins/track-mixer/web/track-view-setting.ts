import { defineSongSetting } from "@plugins/apps/plugins/sonata/plugins/document/web";
import type { TrackViewRow } from "../core";

/**
 * The loaded song's per-track view overrides (color / instrument / mute / hide
 * / volume) — its `sonata_track_view` rows, as a per-song setting of the
 * loaded song (see the shell's `song-setting.ts`). A track with no row has no
 * override.
 *
 * This plugin owns it outright: only its own hooks read it (the piano roll,
 * keyboard, notation, audio engine and the panel read those hooks), and the
 * shell never reads its value. The shell still waits for it before it shows or
 * plays the song — because this plugin REGISTERS it (`SonataDocument.SongSetting`,
 * with `TrackViewObserver`), not because the shell knows it — so no frame draws
 * or plays the song with default track views (a muted track audible) while its
 * rows load. Absent (no track-mixer in the composition): no overrides.
 */
export const trackViewSetting = defineSongSetting<readonly TrackViewRow[]>(
  "track view",
  [],
);
