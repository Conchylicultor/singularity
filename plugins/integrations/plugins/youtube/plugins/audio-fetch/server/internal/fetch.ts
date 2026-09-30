import { basename, dirname } from "node:path";
import { z } from "zod";
import { ensureDep } from "@plugins/infra/plugins/deps/server";
import {
  PythonEntryError,
  runPython,
} from "@plugins/infra/plugins/deps/plugins/python/server";
import type { ExecContext } from "@plugins/infra/plugins/jobs/plugins/supervised-job/core";
import { NonRetryableError } from "@plugins/infra/plugins/jobs/server";
import { VideoIdSchema } from "@plugins/integrations/plugins/youtube/core";
import { youtubeAudioCacheDir } from "../../data-dirs";
import {
  lookupCached,
  releaseLockVideo,
  waitLockVideo,
  writeMeta,
  type AudioMeta,
} from "./cache";
import { youtubeAudioDep } from "./dep";

/** One video's audio, as downloaded: the stream YouTube served, untouched. */
export interface YouTubeAudio {
  /** Absolute path of the audio file, `<cache>/<videoId>.<ext>`. */
  path: string;
  /** The container's extension, e.g. `webm` (opus) or `m4a` (aac). */
  format: string;
  durationSec: number;
  title: string;
  channel: string;
  /** The yt-dlp release that downloaded it. */
  ytDlpVersion: string;
}

/**
 * YouTube will not serve this video to anyone: unavailable, private, removed,
 * age-gated. Retrying cannot help, so it is non-retryable; the message is
 * yt-dlp's own.
 */
export class YouTubeAudioUnavailableError extends NonRetryableError {
  constructor(
    readonly videoId: string,
    readonly reason: string,
  ) {
    super(`YouTube video ${videoId} is unavailable: ${reason}`);
    this.name = "YouTubeAudioUnavailableError";
  }
}

/** `youtube_audio.fetch`'s one stdout document. */
const FetchOutputSchema = z.object({
  file: z.string(),
  format: z.string(),
  durationSec: z.number(),
  title: z.string(),
  channel: z.string(),
  ytDlpVersion: z.string(),
});

/** The fetch module's exit code for a video YouTube will not serve. */
const EXIT_UNAVAILABLE = 3;
/** Its last stderr line then: `UNAVAILABLE: <yt-dlp's message>`. */
const UNAVAILABLE_LINE = /^UNAVAILABLE: (.*)$/m;

/** A download is a few MB; ten minutes covers a slow link and a long video. */
const FETCH_TIMEOUT_MS = 10 * 60_000;

export interface FetchOptions {
  /** Progress lines: the dep install's and yt-dlp's. */
  log?: (line: string) => void;
  /** Test seam: the cache dir. Default: the declared `cache/youtube-audio`. */
  dir?: string;
}

function toAudio(path: string, meta: AudioMeta): YouTubeAudio {
  return {
    path,
    format: meta.format,
    durationSec: meta.durationSec,
    title: meta.title,
    channel: meta.channel,
    ytDlpVersion: meta.ytDlpVersion,
  };
}

/**
 * The audio of one YouTube video, downloaded into the host-wide cache on first
 * use.
 *
 * - **Hit** (the metadata and the audio are both there): touches them for the
 *   sweep and returns — no Python, no lock.
 * - **Miss**: takes the video's host flock (waiting for another process
 *   downloading it), re-checks, makes sure the `youtube-audio` dependency is
 *   installed, and runs `youtube_audio.fetch`. The audio lands under its final
 *   name by rename; the metadata is written after it, atomically.
 *
 * Demands an `ExecContext`: it can install a dependency and runs a download,
 * so it never runs on a backend's event loop.
 *
 * @throws YouTubeAudioUnavailableError when YouTube will not serve the video.
 */
export async function fetchYouTubeAudio(
  videoId: string,
  exec: ExecContext,
  opts: FetchOptions = {},
): Promise<YouTubeAudio> {
  const id = VideoIdSchema.parse(videoId);
  const dir = opts.dir ?? youtubeAudioCacheDir.ensure();
  const say = opts.log ?? (() => {});

  const cached = lookupCached(dir, id);
  if (cached.kind === "hit") return toAudio(cached.audioPath, cached.meta);

  const fd = await waitLockVideo(dir, id, () =>
    say(`another process is downloading ${id}; waiting for it`),
  );
  try {
    const again = lookupCached(dir, id);
    if (again.kind === "hit") return toAudio(again.audioPath, again.meta);

    const ready = await ensureDep(youtubeAudioDep, exec, { log: say });
    let out: z.infer<typeof FetchOutputSchema>;
    try {
      out = await runPython(ready, {
        module: "youtube_audio.fetch",
        input: { videoId: id, outDir: dir, bunPath: process.execPath },
        output: FetchOutputSchema,
        timeoutMs: FETCH_TIMEOUT_MS,
        log: say,
      });
    } catch (err) {
      if (
        err instanceof PythonEntryError &&
        err.exitCode === EXIT_UNAVAILABLE
      ) {
        const reason =
          UNAVAILABLE_LINE.exec(err.stderrTail)?.[1] ?? err.stderrTail;
        throw new YouTubeAudioUnavailableError(id, reason);
      }
      throw err;
    }
    if (
      dirname(out.file) !== dir ||
      basename(out.file) !== `${id}.${out.format}`
    ) {
      throw new Error(
        `youtube_audio.fetch wrote ${out.file}, expected ${dir}/${id}.${out.format}`,
      );
    }
    const meta: AudioMeta = {
      file: basename(out.file),
      format: out.format,
      durationSec: out.durationSec,
      title: out.title,
      channel: out.channel,
      ytDlpVersion: out.ytDlpVersion,
      fetchedAt: new Date().toISOString(),
    };
    writeMeta(dir, id, meta);
    return toAudio(out.file, meta);
  } finally {
    releaseLockVideo(fd);
  }
}
