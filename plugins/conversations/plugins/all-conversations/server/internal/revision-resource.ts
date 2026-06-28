import { createHash } from "node:crypto";
import { count, max, ne } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { conversationsView as conversations } from "@plugins/tasks/plugins/tasks-core/server";
import { conversationsRevisionResource as conversationsRevisionDescriptor } from "../../core";

// The invalidation tick. Reads ONLY coarse, real-change facts — per-status bucket
// counts + total + max(createdAt)/max(endedAt) over non-system conversations —
// hashed to a scalar `rev`. It deliberately NEVER reads updatedAt / lastViewedAt /
// waitingFor, the transient columns the poller rewrites ~1/s: those leave the hash
// byte-identical, so `mode:"push"` no-op suppression fires this only on genuine
// changes (new / status flip / ended). Known v1 gap: a pure title/model edit
// won't pulse the tick (acceptable — the next real change refreshes the window).
export const conversationsRevisionResource = defineResource(conversationsRevisionDescriptor, {
  mode: "push",
  debounceMs: 250,
  loader: async (): Promise<{ rev: string }> => {
    const notSystem = ne(conversations.kind, "system");
    const statusRows = await db
      .select({ status: conversations.status, c: count() })
      .from(conversations)
      .where(notSystem)
      .groupBy(conversations.status);
    const [agg] = await db
      .select({
        total: count(),
        maxCreated: max(conversations.createdAt),
        maxEnded: max(conversations.endedAt),
      })
      .from(conversations)
      .where(notSystem);

    const buckets = statusRows
      .map((r) => `${r.status}:${r.c}`)
      .sort()
      .join(",");
    const payload = JSON.stringify({
      buckets,
      total: agg?.total ?? 0,
      maxCreated: agg?.maxCreated ? new Date(agg.maxCreated).toISOString() : null,
      maxEnded: agg?.maxEnded ? new Date(agg.maxEnded).toISOString() : null,
    });
    return { rev: createHash("sha1").update(payload).digest("hex") };
  },
});
