import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { getConfig } from "@plugins/config_v2/server";
import { recordReport } from "@plugins/reports/server";
import { readSetShrinkConfig } from "../../core";
import { drainShrinks } from "./accumulator";

// Cheap per-worktree scheduled monitor. Runs every minute in EACH worktree's own
// backend (perWorktree) because the accumulator it drains is per-backend memory
// fed by that backend's own persist path. `dedup: "singleton"` + `maxAttempts: 3`
// mirror the other debug monitors. Silent when nothing shed. Drains the buffer
// FIRST (even when disabled) so it can never grow while the monitor is off, then
// files a deduped report per shed when enabled.
export const readSetShrinkMonitorJob = defineJob({
  name: "debug.read-set-shrink-monitor",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "* * * * *", perWorktree: true },
  maxAttempts: 3,
  run: async () => {
    const events = drainShrinks();
    const cfg = getConfig(readSetShrinkConfig);
    if (!cfg.enabled) return;
    for (const e of events) {
      await recordReport({
        kind: "read-set-shrink",
        source: "server-read-set-monitor",
        data: {
          resourceKey: e.resourceKey,
          droppedTables: e.droppedTables,
          oldTables: e.oldTables,
          newTables: e.newTables,
        },
        message: `${e.resourceKey}: read-set dropped [${e.droppedTables.join(", ")}]`,
      });
    }
  },
});
