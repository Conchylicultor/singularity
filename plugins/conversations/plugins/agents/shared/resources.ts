// In-plugin imports go straight to the leaf so the frontend bundle doesn't
// pull `server/api`'s runtime surface. Cross-plugin consumers go through
// `@plugins/conversations/plugins/agents/server/api`.
import { liveCollection, liveValue } from "@plugins/network/plugins/live/core";
import { z } from "zod";
import { AgentSchema, AgentLaunchWithStatusSchema } from "./schemas";

export type { Agent, AgentLaunch, AgentLaunchWithStatus } from "./schemas";

// The user's agent roster — every row of `agents_v`, ordered by (rank,
// createdAt) — as ONE value, not a collection: the Agents sidebar renders the
// whole tree (parentId + per-parent rank), and every other reader looks one
// agent up in it. It is hand-written, so it grows only by hand; the server
// states that bound (`unbounded: { reason }`). `preload: "boot"`: the boot
// snapshot hydrates it (and, being DB-backed, it is L2-persisted), so the
// sidebar and the conversation avatars paint settled on the first frame.
export const agentRows = liveValue("agents", {
  schema: z.array(AgentSchema),
  preload: "boot",
});

// Every agent launch — the WHOLE ordered set (`all`), each with a pointer to
// the latest non-system conversation of its task (`latestConversation`, and
// its status flat as `latestConversationStatus`), so the agent avatars, the
// status dots and an agent's Attempts list render activity without
// subscribing to the bounded conversation lists (which truncate old
// conversations). `null` while the task has no conversation.
//
// Served over `agent_launches` joined to the `task_latest_conversation`
// rollup on the launch's task (`../server/internal/agent-launch-rows.ts`): a
// launch insert is an entrant, its delete an exit, and a conversation or
// attempt write reaches the launches of its task through the rollup's two
// source routes — never a whole-set reload. Ordered as the old list was:
// `createdAt` (the id breaks ties).
//
// The wire row is EXACTLY the legacy `agent-launches` row
// (`AgentLaunchWithStatus`), under the same key: a tab still running a bundle
// that declared `agent-launches` as an old param-less keyed descriptor
// subscribes `{}`, passes the `all` gate and parses these rows with its own
// (identical) schema — the C39 old-bundle check, pinned by
// `../server/internal/agent-launches-oracle.test.ts`. A change to the row must
// rename the key.
//
// Boot-critical (`preload: "boot"`): the avatars paint settled.
export const agentLaunchRows = liveCollection("agent-launches", {
  row: AgentLaunchWithStatusSchema,
  id: "id",
  all: {
    orderBy: [["createdAt", "asc"]],
    unbounded: {
      reason:
        "every agent avatar, status dot and Attempts list looks a launch up by task or agent; launches grow only by hand (one per agent launch)",
    },
  },
  preload: "boot",
});
