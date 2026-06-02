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
    "Slowest HTTP routes, DB queries, and live-state loaders in THIS worktree's server (in-memory window since last reset). Use to debug app/page slowness. Returns top-N by max and average latency per kind.",
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

    const result: Record<
      string,
      {
        aggregates: { label: string; count: number; avgMs: number; maxMs: number; lastMs: number }[];
        slowest: { label: string; durationMs: number; atMs: number }[];
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
        })),
        slowest: profile.slowest[k].slice(0, limit).map((s) => ({
          label: s.label,
          durationMs: s.durationMs,
          atMs: s.atMs,
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
