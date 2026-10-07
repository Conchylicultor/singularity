import { z } from "zod";
import { ensureDep, type Ready } from "@plugins/infra/plugins/deps/deps";
import {
  runPython,
  type PythonEnvSource,
} from "@plugins/infra/plugins/deps/plugins/python/deps";
import type { ExecContext } from "@plugins/infra/plugins/jobs/plugins/supervised-job/core";
import { VideoIdSchema } from "../../core";
import { ytDlpDep } from "../../deps";

/** One video as YouTube's results page lists it. */
export const YouTubeSearchResultSchema = z.object({
  videoId: VideoIdSchema,
  title: z.string(),
  channel: z.string(),
  /** Null for a live stream, or when the results page shows none. */
  durationSec: z.number().nullable(),
  viewCount: z.number().int().nullable(),
  /** The channel's verified badge; null when the page shows none. */
  channelVerified: z.boolean().nullable(),
  /**
   * An auto-generated art track ("Provided to YouTube by …"): the label's
   * studio audio, which a "<Artist> - Topic" channel holds. The results page
   * names that channel by the artist alone, so this is the only way to tell.
   */
  artTrack: z.boolean(),
});
export type YouTubeSearchResult = z.infer<typeof YouTubeSearchResultSchema>;

const SearchOutputSchema = z.object({
  results: z.array(YouTubeSearchResultSchema),
  ytDlpVersion: z.string(),
});

/** One results page is one request; a minute covers a slow link and a bot check. */
const SEARCH_TIMEOUT_MS = 60_000;

export interface SearchOptions {
  /** How many results to ask for (1–50). Default 10. */
  limit?: number;
  /** yt-dlp's lines and the dep install's. */
  log?: (line: string) => void;
}

/**
 * Search YouTube with an installed yt-dlp (`ready` = `ytDlpDep`, ensured):
 * the results in YouTube's own order. For a host process holding no
 * `ExecContext` (a script, through `ensureDepViaCli`); a job uses
 * `searchYouTube`.
 *
 * Throws when yt-dlp fails (a network error, a bot check): a search has no
 * "nothing found" stand-in for that — an empty list means YouTube listed
 * nothing.
 */
export async function searchYouTubeWith(
  ready: Ready<PythonEnvSource>,
  query: string,
  opts: SearchOptions = {},
): Promise<YouTubeSearchResult[]> {
  if (ready.dep.id !== ytDlpDep.id) {
    throw new Error(
      `searchYouTubeWith needs the ${ytDlpDep.id} env, got ${ready.dep.id}`,
    );
  }
  const out = await runPython(ready, {
    module: "youtube_audio.search",
    input: { query, limit: opts.limit ?? 10, bunPath: process.execPath },
    output: SearchOutputSchema,
    timeoutMs: SEARCH_TIMEOUT_MS,
    log: opts.log,
  });
  return out.results;
}

/**
 * Search YouTube: the first `limit` results for `query`, as the results page
 * lists them (one request, nothing downloaded). Installs yt-dlp on first use,
 * so it demands an `ExecContext`: run it from a supervised job's `run` body.
 */
export async function searchYouTube(
  query: string,
  exec: ExecContext,
  opts: SearchOptions = {},
): Promise<YouTubeSearchResult[]> {
  const ready = await ensureDep(ytDlpDep, exec, { log: opts.log });
  return searchYouTubeWith(ready, query, opts);
}
