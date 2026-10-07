import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import type { ExecContext } from "@plugins/infra/plugins/jobs/plugins/supervised-job/core";
import type { SongQuery, SourceAnswer } from "../../core";

/** One place that knows YouTube videos of songs. */
export interface SongVideoSource {
  /** Stable id, stored with each candidate it supplied (`hooktheory`, `youtube-search`). */
  id: string;
  /**
   * The videos it has for the song, best first in its own judgement. Runs in a
   * supervised job's body (hence `exec`: a source may install a dependency or
   * run a download). Answers `unavailable` when its data is not there on this
   * instance; throws when asking failed.
   */
  find: (
    query: SongQuery,
    exec: ExecContext,
    opts: { log: (line: string) => void },
  ) => Promise<SourceAnswer>;
}

/**
 * The song-video sources. A consumer asks `findSongVideos` and never names a
 * source: adding one is a contribution, nothing else.
 */
export const SongVideos = {
  Source: defineServerContribution<SongVideoSource>("song-videos.source", {
    docLabel: (p) => p.id,
  }),
};
