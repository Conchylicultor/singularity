import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { listPrototypeMetas } from "@plugins/apps/plugins/prototypes/plugins/files/server";
import { hasThumbnail, sweepThumbnails, writeThumbnail } from "./cache";
import { fingerprintPrototype } from "./fingerprint";
import { ThumbnailRenderError } from "./errors";
import { renderThumbnail } from "./render";
import { setThumbnailState } from "./state";

/** How long an unused thumbnail is kept. A swept one is simply re-rendered. */
const THUMBNAIL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Render one prototype's thumbnail.
 *
 * `dedup` by slug, so a burst of saves — or a reconcile racing the watcher —
 * collapses to one render per prototype instead of racing two browsers over
 * the same folder. The payload carries the fingerprint the enqueue was for, so
 * the job can tell it has been superseded.
 *
 * `maxAttempts` is left at the default because it only ever governs the
 * UNEXPECTED case: a classified render failure is caught here and becomes a
 * visible state on the card, which is a successful job.
 */
export const renderThumbnailJob = defineJob({
  name: "prototypes.render-thumbnail",
  input: z.object({ name: z.string(), key: z.string() }),
  event: z.never(),
  dedup: { key: (input) => input.name },
  // A browser launch plus a page render is seconds by nature; that is not a
  // slow op worth reporting.
  slowThresholdMs: 60_000,
  run: async ({ input }) => {
    const meta = (await listPrototypeMetas()).find(
      (m) => m.name === input.name,
    );
    // Deleted between enqueue and run — the work is moot, not failed.
    if (!meta) return;

    // Edited between enqueue and run. A fresh enqueue for the new fingerprint
    // is already on its way, so rendering the old bytes would burn a browser to
    // produce a picture nothing will ask for.
    if ((await fingerprintPrototype(meta.name)) !== input.key) return;

    // Another backend (or an earlier run) may have rendered these exact bytes
    // already — the cache is content-addressed and host-global.
    if (await hasThumbnail(input.key)) {
      setThumbnailState(meta.name, { status: "ready", key: input.key });
      return;
    }

    try {
      const png = await renderThumbnail(meta);
      await writeThumbnail(input.key, png);
      setThumbnailState(meta.name, { status: "ready", key: input.key });
    } catch (err) {
      // Only a CLASSIFIED render failure becomes a state. Anything else is a
      // bug in this plugin and must surface as a failed job.
      if (!(err instanceof ThumbnailRenderError)) throw err;
      setThumbnailState(meta.name, {
        status: "failed",
        key: input.key,
        kind: err.kind,
        message: err.message,
      });
      console.error(`[prototype-thumbnails] ${meta.name}: ${err.message}`);
    }
  },
});

/**
 * Nightly cache sweep. Main-only (`perWorktree` unset), which is right for a
 * host-global cache: one machine, one sweeper.
 */
export const sweepThumbnailsJob = defineJob({
  name: "prototypes.sweep-thumbnails",
  // Cron payloads are built from `input.parse({})`, so this must parse `{}`.
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "20 4 * * *" },
  run: async () => {
    await sweepThumbnails(THUMBNAIL_TTL_MS);
  },
});
