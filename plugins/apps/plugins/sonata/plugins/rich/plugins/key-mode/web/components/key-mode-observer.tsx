import { useEffect } from "react";
import {
  keyAutoDetectSetting,
  useMountedSongId,
  useWriteSongSetting,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useLiveRow } from "@plugins/network/plugins/live/web";
import { keyAutoDetects } from "../../shared/resources";

/**
 * Headless observer of the `keyAutoDetectSetting` (`Sonata.SongSetting`,
 * mounted afresh for each loaded song): syncs that song's persisted
 * key-auto-detect setting into the loaded song, whose score pipeline reads it
 * to decide whether to override the authored key with inference.
 *
 * It writes only a settled answer: a newly loaded song's settings start
 * pending, so until this song's row arrives nothing renders under the previous
 * song's setting or a stand-in "off" — and a write for a song no longer loaded
 * is dropped. An absent row (`found: false`) IS the song's setting: off.
 */
export function KeyModeObserver() {
  const songId = useMountedSongId();
  const setKeyAutoDetect = useWriteSongSetting(keyAutoDetectSetting);
  const row = useLiveRow(keyAutoDetects, songId);
  // The row read reduced to the value it settles to — `undefined` while it is
  // pending — so the effect below runs on a real change only.
  const enabled = row.pending ? undefined : row.found && row.row.enabled;

  useEffect(() => {
    if (enabled === undefined) return;
    setKeyAutoDetect(songId, enabled);
  }, [songId, enabled, setKeyAutoDetect]);

  return null;
}
