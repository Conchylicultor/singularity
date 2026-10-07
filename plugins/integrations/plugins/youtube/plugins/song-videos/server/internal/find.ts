import type { ExecContext } from "@plugins/infra/plugins/jobs/plugins/supervised-job/core";
import { createSemaphore } from "@plugins/packages/plugins/semaphore/core";
import type { EmbedStatus } from "@plugins/integrations/plugins/youtube/core";
import {
  checkOembed,
  type OembedCheck,
} from "@plugins/integrations/plugins/youtube/server";
import {
  mergeSourceAnswers,
  rankCandidates,
  type RankedCandidate,
  type SongQuery,
  type SourceAnswer,
  type VideoCandidate,
} from "../../core";
import { SongVideos, type SongVideoSource } from "./source";

/** What one source did for this lookup. */
export type SourceOutcome =
  | { source: string; kind: "answered"; videos: number }
  | { source: string; kind: "unavailable"; reason: string }
  | { source: string; kind: "failed"; message: string };

export interface SongVideosResult {
  /** Every candidate not known to be unplayable in an embed, best first. */
  candidates: RankedCandidate[];
  /** What each source did, in contribution order. */
  sources: SourceOutcome[];
  /** The candidates oEmbed said will not play in an embed: left out of `candidates`. */
  refused: { videoId: string; status: Exclude<EmbedStatus, "ok"> }[];
}

/** Every source failed: there is nothing to rank, and the lookup may work next time. */
export class SongVideoSourcesFailedError extends Error {
  constructor(readonly outcomes: SourceOutcome[]) {
    super(
      `Every song-video source failed: ${outcomes
        .map((o) => `${o.source}: ${o.kind === "failed" ? o.message : o.kind}`)
        .join("; ")}`,
    );
    this.name = "SongVideoSourcesFailedError";
  }
}

/**
 * oEmbed requests in flight at once for one lookup. A lookup checks ~10
 * videos; oEmbed took 12 in flight without throttling.
 */
const EMBED_CHECK_CONCURRENCY = 6;

export interface FindOptions {
  log?: (line: string) => void;
}

/** The seams `findSongVideos` fills from the registry and the network; tests pass their own. */
export interface FindDeps {
  sources: readonly SongVideoSource[];
  checkEmbed: (videoId: string) => Promise<OembedCheck>;
}

async function ask(
  source: SongVideoSource,
  query: SongQuery,
  exec: ExecContext,
  log: (line: string) => void,
): Promise<{ outcome: SourceOutcome; answer: SourceAnswer | null }> {
  try {
    const answer = await source.find(query, exec, { log });
    const outcome: SourceOutcome =
      answer.kind === "answered"
        ? { source: source.id, kind: "answered", videos: answer.videos.length }
        : { source: source.id, kind: "unavailable", reason: answer.reason };
    return { outcome, answer };
  } catch (err) {
    // One source failing (a search hitting a bot check) must not hide what the
    // others found. It is not absorbed: it is an outcome the caller sees and
    // logs, and when EVERY source fails the lookup throws.
    return {
      outcome: {
        source: source.id,
        kind: "failed",
        message: err instanceof Error ? err.message : String(err),
      },
      answer: null,
    };
  }
}

/**
 * Ask oEmbed about every candidate: leave out the ones it says will not play
 * in an embed, and name the ones a source could not (a Hooktheory video has
 * only its id). A candidate oEmbed gave no answer for is kept — unknown is not
 * refused; the player will say.
 */
async function checkEmbeddable(
  candidates: VideoCandidate[],
  checkEmbed: FindDeps["checkEmbed"],
  log: (line: string) => void,
): Promise<{
  playable: VideoCandidate[];
  refused: SongVideosResult["refused"];
}> {
  const gate = createSemaphore(EMBED_CHECK_CONCURRENCY);
  const checks = await Promise.all(
    candidates.map((c) => gate.run(() => checkEmbed(c.videoId))),
  );
  const playable: VideoCandidate[] = [];
  const refused: SongVideosResult["refused"] = [];
  candidates.forEach((c, i) => {
    const check = checks[i]!;
    if (check.kind === "unreachable") {
      log(`${c.videoId}: oEmbed gave no answer (${check.reason}); kept`);
      playable.push(c);
      return;
    }
    if (check.verdict.kind === "decided" && check.verdict.status !== "ok") {
      refused.push({ videoId: c.videoId, status: check.verdict.status });
      return;
    }
    if (check.meta?.kind === "read") {
      playable.push({
        ...c,
        title: c.title ?? check.meta.title,
        channel: c.channel ?? check.meta.channel,
      });
      return;
    }
    if (check.meta?.kind === "unreadable") {
      log(
        `${c.videoId}: oEmbed's 200 body is unreadable (${check.meta.reason})`,
      );
    }
    playable.push(c);
  });
  return { playable, refused };
}

/** `findSongVideos` over explicit sources and checker: the whole pipeline, testable. */
export async function findSongVideosWith(
  deps: FindDeps,
  query: SongQuery,
  exec: ExecContext,
  opts: FindOptions = {},
): Promise<SongVideosResult> {
  const log = opts.log ?? (() => {});
  if (deps.sources.length === 0) {
    throw new Error("No song-video source is registered (SongVideos.Source).");
  }
  const asked = await Promise.all(
    deps.sources.map((s) => ask(s, query, exec, log)),
  );
  const outcomes = asked.map((a) => a.outcome);
  for (const o of outcomes) {
    log(
      `source ${o.source}: ${
        o.kind === "answered"
          ? `${o.videos} video(s)`
          : o.kind === "unavailable"
            ? `unavailable (${o.reason})`
            : `failed (${o.message})`
      }`,
    );
  }
  if (outcomes.every((o) => o.kind === "failed")) {
    throw new SongVideoSourcesFailedError(outcomes);
  }
  const merged = mergeSourceAnswers(
    asked.flatMap(({ outcome, answer }) =>
      answer === null ? [] : [{ source: outcome.source, answer }],
    ),
  );
  const { playable, refused } = await checkEmbeddable(
    merged,
    deps.checkEmbed,
    log,
  );
  for (const r of refused)
    log(`${r.videoId}: oEmbed says ${r.status}; left out`);
  return {
    candidates: rankCandidates(query, playable),
    sources: outcomes,
    refused,
  };
}

/**
 * Which YouTube videos are this song? Asks every `SongVideos.Source`, merges
 * their answers per video, drops the ones oEmbed says will not play in an
 * embed, and ranks the rest towards the studio recording (`rankCandidates`).
 *
 * Runs in a supervised job's body: a source may install yt-dlp or search with
 * it. A source that fails is reported in `sources` and the others still count;
 * when every one fails, throws `SongVideoSourcesFailedError`.
 */
export function findSongVideos(
  query: SongQuery,
  exec: ExecContext,
  opts: FindOptions = {},
): Promise<SongVideosResult> {
  return findSongVideosWith(
    { sources: SongVideos.Source.getContributions(), checkEmbed: checkOembed },
    query,
    exec,
    opts,
  );
}
