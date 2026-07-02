import { z } from "zod";
import { basename } from "path";
import { Mcp } from "@plugins/infra/plugins/mcp/server";
import { getConversation } from "@plugins/tasks/plugins/tasks-core/server";
import { type SpanKind, waitSplit } from "@plugins/infra/plugins/runtime-profiler/core";
import { runtimeProfileSchema } from "../../shared/endpoints";

const KINDS: readonly SpanKind[] = ["http", "db", "loader", "sub", "push", "flush", "job"];

// This tool proxies to arbitrary worktree backends, which may still run code
// predating the wall-clock-decomposition fields. Backfill the missing numerics
// with 0 (never fabricated from other fields) so the shared wire schema still
// parses instead of crashing the tool on a stale target.
const STALE_AGG_FIELDS = [
  "waitTotalMs",
  "childTotalMs",
  "selfTotalMs",
  "recentMaxMs",
  "maxAgeMs",
] as const;
const STALE_SPAN_FIELDS = ["waitMs", "childMs", "selfMs"] as const;

function backfillStaleProfile(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const profile = raw as {
    aggregates?: Record<string, Record<string, unknown>[]>;
    slowest?: Record<string, Record<string, unknown>[]>;
  };
  for (const rows of Object.values(profile.aggregates ?? {})) {
    for (const agg of rows) {
      for (const field of STALE_AGG_FIELDS) agg[field] ??= 0;
    }
  }
  for (const rows of Object.values(profile.slowest ?? {})) {
    for (const span of rows) {
      for (const field of STALE_SPAN_FIELDS) span[field] ??= 0;
    }
  }
  return raw;
}

export const runtimeProfileTool = Mcp.tool({
  name: "get_runtime_profile",
  description: `Slowest HTTP routes, DB queries, and live-state loaders in a worktree's server (in-memory window since last reset). Use to debug app/page slowness, N+1 patterns, and queueing/head-of-line blocking. Aggregates are sorted by \`recentMaxMs\` (max within a rolling ~5-min window — "is it slow NOW"); \`maxMs\` is the since-boot peak and \`maxAgeMs\` how long ago it was set, so an old spike reads as old instead of a live problem. Each db/loader aggregate includes a \`byParent\` breakdown attributing it to the enclosing request/loader that issued it, and each \`slowest\` span carries its immediate \`parent\`.

Kinds: \`http\` (routes; the span encloses the per-route dedupe/concurrency gates, so its wall-clock matches client-observed latency), \`db\` (queries + the pool \`[acquire]\` connect-wait), \`loader\` (live-state resource loads), the origin entries \`sub\` (a tab subscribed) / \`push\` (a notify cascade) that trigger loaders — a loader's \`parent\` names which one triggered it — and \`job\` (background queue jobs). \`flush\` is the live-state notify-flush cycle (\`flushNotifies\`): its \`byParent\` names which resource dominated a cycle (head-of-line), and \`push\` carries \`deliver:<key>\` leaves whose duration is the first-notify→send delivery latency (the "UI is stale" window) for that resource.

Wall-clock decomposition: EVERY entry — including composite ones like \`flush\` — decomposes its per-call time into \`waitMs\` (time covered by named gate/pool waits at ANY depth of its subtree; gate waits propagate to every open ancestor as an interval UNION over the entry's own timeline, so waitMs ≤ wall even with many concurrent waiters), \`childMs\` (time covered by direct-child entries), and \`selfMs\` (the remainder — own orchestration; on composite spans a conservative upper bound of own work). The \`waits\` map names each gate layer's union ms. Reading a composite: a flush with \`childMs\` ≈ avg, \`waits\` naming \`loader-acquire\`/\`db-acquire\`, and small \`selfMs\` spent its wall awaiting gate-blocked children — it did no work itself. Reading a leaf: mostly \`waitMs\` = head-of-line-blocked (the op itself is fast); mostly \`selfMs\` = genuinely slow.

Wait layers: \`loader-acquire\` (per-backend DB loader gate slot), \`db-acquire\` (pg pool connect), \`heavy-read-acquire\`/\`heavy-read-local\` (host-wide heavy git/fs read slots), \`read-admit\` (resource read admission), \`read-coalesce\` (joined an in-flight resource read), \`endpoint-concurrency\` (per-route concurrency gate), \`endpoint-dedupe\` (joined an in-flight identical GET — joiners show endpoint-dedupe ≈ wall, selfMs ≈ 0), \`git-coalesce:<name>\` (joined an in-flight git recompute), \`git-memo-hit:<name>\`/\`git-memo-miss:<name>\` (0ms markers — memo hit-rate, not blocking).

Default: profiles the current conversation's worktree server. Pass \`worktree\` to target a different worktree (e.g. "att-1778089188-7uvf" or "singularity" for main).`,
  inputSchema: {
    kind: z
      .enum(["http", "db", "loader", "sub", "push", "flush", "job", "all"])
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
    const profile = runtimeProfileSchema.parse(backfillStaleProfile(await res.json()));
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
          waitMs: number;
          childMs: number;
          selfMs: number;
          maxMs: number;
          maxAgeMs: number;
          recentMaxMs: number;
          lastMs: number;
          waits?: Record<string, number>;
          byParent: ParentRow[];
        }[];
        slowest: {
          label: string;
          durationMs: number;
          waitMs: number;
          childMs: number;
          selfMs: number;
          atMs: number;
          parent: { kind: SpanKind; label: string } | null;
          waits?: Record<string, number>;
        }[];
      }
    > = {};

    for (const k of targetKinds) {
      result[k] = {
        aggregates: profile.aggregates[k].slice(0, limit).map((agg) => {
          // Per-call wall-clock decomposition: avg = wait (gate unions) +
          // child (direct-child unions, overlapping waits) with selfMs the
          // remainder — a high avgMs with a high waitMs/low selfMs is
          // head-of-line blocking, not a slow resource.
          const ws = waitSplit(agg);
          return {
            label: agg.label,
            count: agg.count,
            avgMs: Math.round(ws.avgMs),
            waitMs: Math.round(ws.waitMs),
            childMs: Math.round(ws.childMs),
            selfMs: Math.round(ws.selfMs),
            maxMs: agg.maxMs,
            maxAgeMs: Math.round(agg.maxAgeMs),
            recentMaxMs: agg.recentMaxMs,
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
          waitMs: s.waitMs,
          childMs: s.childMs,
          selfMs: s.selfMs,
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
