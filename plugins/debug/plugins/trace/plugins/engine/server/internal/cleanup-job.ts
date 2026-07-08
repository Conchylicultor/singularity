import { z } from "zod";
import { lt } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { _traces } from "./tables";

// Traces are 7-day evidence, then swept. A trace is a debugging record, not a
// durable artifact — bounding retention keeps the table from growing unbounded
// (it is written exactly when the system is slow). A scheduled job, NOT an
// in-process timer (per the no-polling rule): perWorktree because each worktree
// owns its own traces in its own DB fork; singleton so the sweep can never pile
// up; maxAttempts kept low so a transiently-broken sweep doesn't become a
// dead-job storm. The bootTraceCleanupJob precedent with the retention changed.
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export const traceCleanupJob = defineJob({
  name: "debug.trace-cleanup",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "0 3 * * *", perWorktree: true },
  maxAttempts: 3,
  run: async () => {
    const cutoff = new Date(Date.now() - RETENTION_MS);
    await db.delete(_traces).where(lt(_traces.createdAt, cutoff));
  },
});
