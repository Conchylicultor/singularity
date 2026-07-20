import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { getConfig } from "@plugins/config_v2/server";
import { recordReport } from "@plugins/reports/server";
import { opWedgeWatchdogConfig, type OpWedgePayload } from "../../core";
import { readWedgedOps } from "./read-fleet";
import { captureOpWedge } from "./capture";

// Per-process set of wedges ALREADY captured + filed, keyed on
// `<worktree>:<op>:<pid>` — the identity of the stuck PROCESS.
//
// This guard is load-bearing twice over:
//
//   1. The marker keeps naming the same live pid every tick for as long as the
//      wedge lasts (8-17h, observed). Without the guard a single wedge would
//      file ~1000 reports and — far worse — run ~1000 `sample`s against a box
//      that is already in trouble.
//   2. `sample` is expensive. Running it once per (worktree, op, pid) is the
//      research doc's explicit bound.
//
// This is boot-watchdog's superseded-wedge dedup pattern (a module-level Set
// keyed on the signal's identity). Deliberately NOT boot-watchdog's OPEN-wedge
// re-file-every-tick behaviour: there the row's `count` is the useful signal
// (≈ minutes wedged) and re-filing is free, whereas here re-filing would mean
// re-capturing. The wedge's duration is instead recoverable from the report's
// `firstSeenAt` and the dump.
//
// Across a main restart the module reloads with a fresh Set, so a still-live
// wedge re-captures once and collapses onto its stable fingerprint row
// (`cli-op-wedge:<worktree>:<op>:<pid>`), bumping `count`. That is the desired
// behaviour: a second capture of a wedge that survived a main restart is new
// evidence, not noise. The Set is bounded by the number of distinct real wedges
// in one main lifetime — single digits.
const capturedWedges = new Set<string>();

// Main-only wedged-CLI-op watchdog. Runs every minute in the MAIN backend only
// — NO perWorktree — for two independent reasons:
//
//   1. The wedged process is the worktree's own `./singularity build`, and that
//      build is what restarts (and, while wedged, keeps down) the very backend
//      a perWorktree job would run in. A backend cannot be relied on to observe
//      the op that is holding it hostage.
//   2. The markers live on shared disk (`~/.singularity/worktrees/*/ops/`) and
//      wedges are cross-worktree by nature (they serialise the whole box), so
//      one sweeper reading the shared fleet is both sufficient and correct.
//      N per-worktree sweepers would race to capture the same wedge.
//
// `dedup: "singleton"` + `maxAttempts: 3` mirror the other debug monitors.
// Silent when every live op is inside its budget.
export const opWedgeWatchdogMonitorJob = defineJob({
  name: "debug.op-wedge-watchdog-monitor",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "* * * * *" },
  maxAttempts: 3,
  run: async () => {
    const cfg = getConfig(opWedgeWatchdogConfig);
    if (!cfg.enabled) return;

    const now = Date.now();
    for (const { info, wedgedMs } of await readWedgedOps(now, cfg.budgetMs)) {
      const key = `${info.slug}:${info.op}:${info.pid}`;
      if (capturedWedges.has(key)) continue;
      // Mark BEFORE the capture: `sample` takes seconds, and a slow capture must
      // not let the next tick start a second one against the same process.
      capturedWedges.add(key);

      // The capture NEVER kills the process — the live specimen is the entire
      // point of this watchdog. It reports its own per-step failures rather
      // than throwing, so a denied `sample` yields a partial capture that the
      // report explicitly labels partial, never a silently-missing section.
      const capture = cfg.capture
        ? await captureOpWedge({
            pid: info.pid,
            worktree: info.slug,
            op: info.op,
            startedAt: info.startedAt,
          })
        : undefined;

      const data: OpWedgePayload = {
        worktree: info.slug,
        op: info.op,
        pid: info.pid,
        startedAt: info.startedAt,
        wedgedMs,
        budgetMs: cfg.budgetMs,
        capture,
      };
      // The message must never read as a clean capture when it was not one: a
      // partial capture is called out in the one-line message, the summary
      // view, and the filed task alike.
      let detail = " — capture disabled";
      if (capture) {
        detail = ` — cpu ${capture.cpu.verdict}, ${capture.children.length} live children`;
        if (capture.failures.length > 0) {
          detail += ` — PARTIAL capture (${capture.failures.length} step(s) failed)`;
        }
      }
      await recordReport({
        kind: "cli-op-wedge",
        source: "server-op-wedge-watchdog",
        data,
        message: `${info.slug} ${info.op} (pid ${info.pid}) wedged ${Math.round(wedgedMs / 1000)}s${detail}`,
      });
    }
  },
});
