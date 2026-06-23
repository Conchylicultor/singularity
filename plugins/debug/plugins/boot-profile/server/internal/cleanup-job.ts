import { z } from "zod";
import { lt } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { _bootTraces } from "./tables";

// Saved boot-trace snapshots are kept for 30 days, then swept. Permalinks are a
// debugging convenience, not durable records — bounding retention keeps the
// table from growing unbounded. A scheduled job, NOT an in-process timer (per
// the no-polling rule): perWorktree because each worktree owns its own snapshots
// in its own DB fork; singleton so the sweep can never pile up; maxAttempts kept
// low so a transiently-broken sweep doesn't become a dead-job storm.
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export const bootTraceCleanupJob = defineJob({
  name: "debug.boot-trace-cleanup",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "0 3 * * *", perWorktree: true },
  maxAttempts: 3,
  run: async () => {
    const cutoff = new Date(Date.now() - RETENTION_MS);
    await db.delete(_bootTraces).where(lt(_bootTraces.createdAt, cutoff));
  },
});
