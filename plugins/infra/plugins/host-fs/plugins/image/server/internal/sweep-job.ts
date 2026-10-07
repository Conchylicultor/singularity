import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { Log } from "@plugins/primitives/plugins/log-channels/server";
import { resizedImagesDir } from "../../data-dirs";
import { sweepResizedImages } from "./sweep";

const log = Log.channel("host-fs-image");

/**
 * Daily: bound the resized-image cache — 30 days unused, then 1 GB, least
 * recently used first. The cache is host-wide; one sweeper is enough.
 */
export const resizedImagesSweepJob = defineJob({
  name: "host-fs-image.sweep",
  description:
    "Deletes resized copies of host images unused for 30 days, then the oldest past 1 GB, so the cache stays small.",
  hold: "seconds",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "50 5 * * *" }, // daily at 05:50 UTC
  async run() {
    const r = await sweepResizedImages({
      dir: resizedImagesDir.path,
      nowMs: Date.now(),
    });
    const mb = (bytes: number) => (bytes / 1e6).toFixed(1);
    log.publish(
      `resized-image sweep: removed ${r.removed} (${mb(r.removedBytes)} MB), kept ${mb(r.keptBytes)} MB`,
    );
  },
});
