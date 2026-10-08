import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import {
  serveCollection,
  serveValue,
} from "@plugins/network/plugins/live/server";
import { withRank } from "@plugins/primitives/plugins/rank/server";
import { agents } from "./views";
import type { Agent } from "./schema";
import { agentLaunchRowsServeOptions } from "./agent-launch-rows";
// `key` / `schema` come from the shared declarations — the single source of
// truth both runtimes read; the server adds only the DB half.
import { agentRows, agentLaunchRows } from "../../shared/resources";

// The whole roster, recomputed and pushed whole on every write to `agents` (the
// loader's captured read-set routes it here).
export const agentRowsServed = serveValue(agentRows, {
  source: "db",
  unbounded: {
    reason:
      "the user's hand-written agent roster (agents_v) — the Agents sidebar renders the whole tree; grows only by hand",
  },
  loader: async (): Promise<Agent[]> => {
    const rows = await db
      .select()
      .from(agents)
      .orderBy(asc(agents.rank), asc(agents.createdAt));
    return rows.map(withRank);
  },
});

// The whole ordered set of launches and its `:rows` point sibling, routed over
// `agent_launches` and the `task_latest_conversation` rollup's two sources
// (`./agent-launch-rows.ts`). Persisted to L2, so the `{}` snapshot stays
// current with nobody subscribed.
export const agentLaunchRowsServed = serveCollection(
  agentLaunchRows,
  agentLaunchRowsServeOptions,
);
