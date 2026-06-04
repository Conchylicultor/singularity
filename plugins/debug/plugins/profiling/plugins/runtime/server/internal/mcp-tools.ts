import { z } from "zod";
import { Mcp } from "@plugins/infra/plugins/mcp/server";
import {
  getRuntimeProfile,
  type SpanKind,
} from "@plugins/infra/plugins/runtime-profiler/core";

const KINDS: readonly SpanKind[] = ["http", "db", "loader"];

export const runtimeProfileTool = Mcp.tool({
  name: "get_runtime_profile",
  description:
    "Slowest HTTP routes, DB queries, and live-state loaders in THIS worktree's server (in-memory window since last reset). Use to debug app/page slowness and N+1 patterns. Returns top-N by max and average latency per kind; each db/loader aggregate includes a `byParent` breakdown attributing it to the enclosing request/loader that issued it, and each `slowest` span carries its immediate `parent`.",
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
  },
  async handler({ kind = "all", limit = 15 }) {
    const profile = getRuntimeProfile();
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
