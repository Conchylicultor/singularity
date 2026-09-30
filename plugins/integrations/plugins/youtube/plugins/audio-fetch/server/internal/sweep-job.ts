import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { Log } from "@plugins/primitives/plugins/log-channels/server";
import { youtubeAudioCacheDir } from "../../data-dirs";
import { sweepYouTubeAudio } from "./sweep";

const log = Log.channel("youtube-audio");

/**
 * Daily: bound the audio cache — 30 days unused, then 2 GB, least recently
 * used first, never a video being downloaded. Main-only by virtue of its
 * schedule (the cache is host-wide, one sweeper is enough).
 */
export const youtubeAudioSweepJob = defineJob({
  name: "youtube-audio.sweep",
  description:
    "Deletes downloaded YouTube audio unused for 30 days, then the oldest past 2 GB, so the cache stays small.",
  hold: "seconds",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "45 5 * * *" }, // daily at 05:45 UTC
  async run() {
    const report = await sweepYouTubeAudio({
      dir: youtubeAudioCacheDir.path,
      nowMs: Date.now(),
    });
    const mb = (bytes: number) => (bytes / 1e6).toFixed(1);
    log.publish(
      `youtube-audio sweep: removed ${report.removed.length}` +
        (report.removed.length > 0
          ? ` (${report.removed.map((r) => `${r.videoId} ${r.reason} ${mb(r.bytes)} MB`).join(", ")})`
          : "") +
        `, kept ${mb(report.keptBytes)} MB` +
        (report.skippedLocked.length > 0
          ? `; skipped while downloading: ${report.skippedLocked.join(", ")}`
          : ""),
    );
  },
});
