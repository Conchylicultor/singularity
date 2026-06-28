import { z } from "zod";
import { basename } from "path";
import { extractPath } from "@plugins/infra/plugins/endpoints/core";
import { Mcp } from "@plugins/infra/plugins/mcp/server";
import { getConversation } from "@plugins/tasks/plugins/tasks-core/server";
import {
  bootBenchRun,
  bootBenchRunResponseSchema,
  type BootBenchRunBody,
} from "../../shared/endpoints";
import { buildReport } from "./aggregate";

export const benchmarkBootTool = Mcp.tool({
  name: "benchmark_boot",
  description: `Repeatable cold-cache benchmark of the boot burst + live-state loaders in a worktree's RUNNING backend (no restart). Forces a truly cold boot by DELETING the L2 persisted snapshot rows for the boot-critical keys immediately before each cold iteration, so the boot-snapshot endpoint must recompute from loaders.

Measures, per iteration, all in the target process (so the event-loop histogram and the loaders share one process — no network noise in the measured window):
- boot-snapshot total time AND per-key { source: persisted|loader, workMs } (persisted workMs is the single batched read amortized ÷ N — directional, not per-key truth).
- edited-files first-subscribe latency (onFirstSubscribe + loader) for the conversation fixture.
- commits-graph (.delta / .graph) first-subscribe latency for the attempt fixture.
- event-loop lag (max) during the burst.

Scope = live-server cold: it deliberately EXCLUDES server-boot work (catch-up, derived-table rebuild, pool warm), which is noisier. Run on an idle backend for clean cold numbers (a concurrent flushNotifies can re-persist rows mid-run).

warm mode runs BEFORE any cold-clear (the snapshot is naturally warm on a running backend); cold per-key sources should be all "loader" and warm mostly "persisted" and faster. Discards the first \`warmup\` iterations of each set (GC settle). Returns per-mode { min, median, p95 } aggregates plus the resolved fixtures; the agent saves a baseline run and compares the after run itself.

Default: benchmarks the current conversation's worktree server. Pass \`worktree\` to target a different worktree (e.g. "att-1778089188-7uvf" or "singularity" for main). Pass \`conversationId\`/\`attemptId\` to pin the exact same fixtures across a before/after pair.`,
  inputSchema: {
    iterations: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Recorded iterations per mode (after warmup). Defaults to 10."),
    warmup: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe("Discarded warmup iterations per mode. Defaults to 2."),
    mode: z
      .enum(["cold", "warm", "both"])
      .optional()
      .describe('Which sets to run. Defaults to "both".'),
    conversationId: z
      .string()
      .optional()
      .describe("Pin the edited-files conversation fixture (else auto-resolved)."),
    attemptId: z
      .string()
      .optional()
      .describe("Pin the commits-graph attempt fixture (else auto-resolved)."),
    worktree: z
      .string()
      .optional()
      .describe("Target worktree name. Defaults to the conversation's own worktree."),
  },
  async handler(
    { iterations, warmup, mode, conversationId, attemptId, worktree },
    { conversationId: ctxConversationId },
  ) {
    let worktreeName: string;
    if (worktree) {
      worktreeName = worktree;
    } else {
      const conv = await getConversation(ctxConversationId);
      if (!conv) throw new Error(`Unknown conversation "${ctxConversationId}"`);
      worktreeName = basename(conv.worktreePath);
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(worktreeName)) {
      throw new Error(`Unsafe worktree name: "${worktreeName}"`);
    }

    // Always run the benchmark through the gateway, which only ever proxies to
    // the worktree's live backend (`w.active`). Running it in this process's own
    // runtime would benchmark a stale/orphaned process generation after a
    // hot-swap restart, and clear the wrong DB's snapshot.
    const reqBody: BootBenchRunBody = { iterations, warmup, mode, conversationId, attemptId };
    const url = `http://${worktreeName}.localhost:9000${extractPath(bootBenchRun.route)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(reqBody),
    });
    if (!res.ok) {
      throw new Error(
        `boot-bench run failed (${res.status}) for worktree "${worktreeName}"`,
      );
    }
    const response = bootBenchRunResponseSchema.parse(await res.json());
    const report = buildReport(response);

    return {
      content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
    };
  },
});
