import { z } from "zod";
import { basename } from "path";
import { Mcp } from "@plugins/infra/plugins/mcp/server";
import { getConversation } from "@plugins/tasks/plugins/tasks-core/server";
import { type SpanKind } from "@plugins/infra/plugins/runtime-profiler/core";
import { runtimeProfileSchema } from "../../shared/endpoints";

const KINDS: readonly SpanKind[] = ["http", "db", "loader"];

export const runtimeProfileTool = Mcp.tool({
  name: "get_runtime_profile",
  description: `Slowest HTTP routes, DB queries, and live-state loaders in a worktree's server (in-memory window since last reset). Use to debug app/page slowness and N+1 patterns. Returns top-N by max and average latency per kind; each db/loader aggregate includes a \`byParent\` breakdown attributing it to the enclosing request/loader that issued it, and each \`slowest\` span carries its immediate \`parent\`.

Default: profiles the current conversation's worktree server. Pass \`worktree\` to target a different worktree (e.g. "att-1778089188-7uvf" or "singularity" for main).`,
  inputSchema: {
    kind: z
      .enum(["http", "db", "loader", "all"])
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
          maxMs: number;
          lastMs: number;
          byParent: ParentRow[];
        }[];
        slowest: {
          label: string;
          durationMs: number;
          atMs: number;
          parent: { kind: SpanKind; label: string } | null;
        }[];
      }
    > = {};

    for (const k of targetKinds) {
      result[k] = {
        aggregates: profile.aggregates[k].slice(0, limit).map((agg) => ({
          label: agg.label,
          count: agg.count,
          avgMs: Math.round(agg.totalMs / agg.count),
          maxMs: agg.maxMs,
          lastMs: agg.lastMs,
          byParent: agg.byParent.map((pb) => ({
            parentKind: pb.parent.kind,
            parentLabel: pb.parent.label,
            count: pb.count,
            avgMs: Math.round(pb.totalMs / pb.count),
            maxMs: pb.maxMs,
          })),
        })),
        slowest: profile.slowest[k].slice(0, limit).map((s) => ({
          label: s.label,
          durationMs: s.durationMs,
          atMs: s.atMs,
          parent: s.parent,
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
