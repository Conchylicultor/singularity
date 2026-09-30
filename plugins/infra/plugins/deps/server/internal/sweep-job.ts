import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { listWorktreePaths } from "@plugins/infra/plugins/worktree/server";
import { Log } from "@plugins/primitives/plugins/log-channels/server";
import { declaredDeps } from "../../deps";
// The engine's own files, by relative path (inside one plugin): the sweep is
// this job's alone, so it is not part of the `deps` barrel's API.
import { defaultStore } from "../../deps/internal/store";
import { SWEEP_IDLE_MS, sweepDeps } from "../../deps/internal/sweep";

const log = Log.channel("deps");

/**
 * Daily: reclaim installs nothing uses any more (an old lock, a dropped
 * worktree's trial). Main-only by virtue of its schedule; runs in process —
 * it only reads small files and removes directories asynchronously.
 */
export const depsSweepJob = defineJob({
  name: "deps.sweep",
  hold: "minutes",
  inProcess:
    "A reclaim pass over the deps cache: small state-file reads, one identity derivation per (dep, checkout) and async directory removals; a restart aborts it and the next daily tick repeats it.",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "30 5 * * *" }, // daily at 05:30 UTC
  async run() {
    const report = await sweepDeps({
      store: defaultStore(),
      deps: await declaredDeps(),
      checkouts: await listWorktreePaths(),
      now: new Date(),
      idleMs: SWEEP_IDLE_MS,
    });
    log.publish(
      `deps sweep: removed ${report.removed.length} (${report.removed.join(", ") || "none"}), kept ${report.kept.length}` +
        (report.underivable.length > 0
          ? `; identity not derivable for ${report.underivable.length}: ${report.underivable.join("; ")}`
          : ""),
    );
  },
});
