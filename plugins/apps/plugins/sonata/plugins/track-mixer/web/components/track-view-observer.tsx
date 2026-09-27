import { useEffect } from "react";
import {
  useMountedSongId,
  useWriteSongSetting,
} from "@plugins/apps/plugins/sonata/plugins/shell/web";
import { useLive } from "@plugins/network/plugins/live/web";
import { trackViews } from "../../shared/resources";
import { trackViewSetting } from "../track-view-setting";

/**
 * Headless observer of the `trackViewSetting` (`Sonata.SongSetting`, mounted
 * afresh for each loaded song, so a song switch starts from that song's own
 * read): syncs the song's persisted track-view overrides into the loaded song,
 * where every track-mixer hook reads them and the shell's score gate waits for
 * them.
 *
 * It writes only a settled answer: a newly loaded song's settings start
 * pending, so until this song's rows arrive no track sounds or draws with a
 * default view (a muted track audible) or with the previous song's — and a
 * write for a song no longer loaded is dropped.
 */
export function TrackViewObserver() {
  const songId = useMountedSongId();
  const setTrackViews = useWriteSongSetting(trackViewSetting);
  const views = useLive(trackViews, { songId });

  useEffect(() => {
    if (views.pending) return;
    setTrackViews(songId, views.data);
  }, [songId, views, setTrackViews]);

  return null;
}
