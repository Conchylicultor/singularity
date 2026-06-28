import { z } from "zod";
import { basename } from "path";
import { Mcp } from "@plugins/infra/plugins/mcp/server";
import { getConversation } from "@plugins/tasks/plugins/tasks-core/server";
import { type SpanKind, waitSplit } from "@plugins/infra/plugins/runtime-profiler/core";
import { runtimeProfileSchema } from "../../shared/endpoints";

const KINDS: readonly SpanKind[] = ["http", "db", "loader", "sub", "push", "flush"];

export const runtimeProfileTool = Mcp.tool({
  name: "get_runtime_profile",
  description: `Slowest HTTP routes, DB queries, and live-state loaders in a worktree's server (in-memory window since last reset). Use to debug app/page slowness, N+1 patterns, and queueing/head-of-line blocking. Returns top-N by max and average latency per kind; each db/loader aggregate includes a \`byParent\` breakdown attributing it to the enclosing request/loader that issued it, and each \`slowest\` span carries its immediate \`parent\`.

Kinds: \`http\` (routes), \`db\` (queries + the pool \`[acquire]\` connect-wait), \`loader\` (live-state resource loads), and the origin entries \`sub\` (a tab subscribed) / \`push\` (a notify cascade) that trigger loaders — a loader's \`parent\` names which one triggered it. \`flush\` is the live-state notify-flush cycle (\`flushNotifies\`): its \`byParent\` names which resource dominated a cycle (head-of-line), and \`push\` carries \`deliver:<key>\` leaves whose duration is the first-notify→send delivery latency (the "UI is stale" window) for that resource.

Wait-vs-work: every entry (loader/http/sub/push) carries a \`waits\` map (gate/lock layer → ms) and a derived \`workMs\` = avg − Σwaits. \`loader-acquire\` = waiting for a DB connection gate slot; \`heavy-read-acquire\` = waiting for a host-wide heavy git/fs read slot. A loader that is mostly \`waits\` was head-of-line-blocked (the resource itself is fast); a loader that is mostly \`workMs\` is genuinely slow.

Default: profiles the current conversation's worktree server. Pass \`worktree\` to target a different worktree (e.g. "att-1778089188-7uvf" or "singularity" for main).`,
  inputSchema: {
    kind: z
      .enum(["http", "db", "loader", "sub", "push", "flush", "all"])
      .optional()
      .describe('Span kind to filter. Defaults to "all".'),
    limit: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Max rows per kind. Defaults to 15."),
    worktree: z
      .string()
      .optional()
      .describe(
        "Target worktree name. Defaults to the conversation's own worktree.",
      ),
  },
  async handler({ kind = "all", limit = 15, worktree }, { conversationId }) {
    let worktreeName: string;
    if (worktree) {
      worktreeName = worktree;
    } else {
      const conv = await getConversation(conversationId);
      if (!conv) throw new Error(`Unknown conversation "${conversationId}"`);
      worktreeName = basename(conv.worktreePath);
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(worktreeName)) {
      throw new Error(`Unsafe worktree name: "${worktreeName}"`);
    }

    // Always read the profile through the gateway, which only ever proxies to
    // the worktree's live backend (`w.active`). Reading this process's own
    // in-memory recorder would silently report a stale/orphaned process
    // generation after a hot-swap restart.
    const url = `http://${worktreeName}.localhost:9000/api/debug/profiling/runtime`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `runtime profile fetch failed (${res.status}) for worktree "${worktreeName}"`,
      );
    }
    const profile = runtimeProfileSchema.parse(await res.json());
    const targetKinds: readonly SpanKind[] =
      kind === "all" ? KINDS : [kind as SpanKind];

    interface ParentRow {
      parentKind: SpanKind;
      parentLabel: string;
      count: number;
      avgMs: number;
      maxMs: number;
    }
    const result: Record<
      string,
      {
        aggregates: {
          label: string;
          count: number;
          avgMs: number;
          workMs: number;
          maxMs: number;
          lastMs: number;
          waits?: Record<string, number>;
          byParent: ParentRow[];
        }[];
        slowest: {
          label: string;
          durationMs: number;
          atMs: number;
          parent: { kind: SpanKind; label: string } | null;
          waits?: Record<string, number>;
        }[];
      }
    > = {};

    for (const k of targetKinds) {
      result[k] = {
        aggregates: profile.aggregates[k].slice(0, limit).map((agg) => {
          // Pure operation cost: average duration minus the average wait. The
          // direct lock-vs-work read — a high avgMs with a high waits/low workMs
          // is head-of-line blocking, not a slow resource.
          const ws = waitSplit(agg);
          return {
            label: agg.label,
            count: agg.count,
            avgMs: Math.round(ws.avgMs),
            workMs: Math.round(ws.workMs),
            maxMs: agg.maxMs,
            lastMs: agg.lastMs,
            waits: agg.waits,
            byParent: agg.byParent.map((pb) => ({
              parentKind: pb.parent.kind,
              parentLabel: pb.parent.label,
              count: pb.count,
              avgMs: Math.round(pb.totalMs / pb.count),
              maxMs: pb.maxMs,
            })),
          };
        }),
        slowest: profile.slowest[k].slice(0, limit).map((s) => ({
          label: s.label,
          durationMs: s.durationMs,
          atMs: s.atMs,
          parent: s.parent,
          waits: s.waits,
        })),
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { sinceMs: profile.sinceMs, kinds: result },
            null,
            2,
          ),
        },
      ],
    };
  },
});
