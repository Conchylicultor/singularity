import { asc, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { compileEdges, rel } from "@plugins/infra/plugins/query-resource/server";
import {
  conversationCascadeSignatures,
  conversationsActiveResource,
  conversationsView,
} from "@plugins/tasks/plugins/tasks-core/server";
import { _agent_launches } from "./tables";
import { _task_latest_conversation } from "./rollup-table";
import { agents } from "./views";
import type { Agent, AgentLaunchWithStatus } from "./schema";
// `key` / `schema` / keyed-ness come from the shared client descriptors — the
// single source of truth both runtimes read. The server adds only the DB half
// (loader + cascade), so the keyed contract here can't drift from the client
// (the missing-`keyOf` crash that motivated this).
import {
  agentsResource as agentsDescriptor,
  agentLaunchesResource as agentLaunchesDescriptor,
  type AgentLaunchConversationRef,
} from "../../shared/resources";

export const agentsResource = defineResource(agentsDescriptor, {
  mode: "push",
  loader: async () =>
    db.select().from(agents).orderBy(asc(agents.rank), asc(agents.createdAt)) as unknown as Promise<Agent[]>,
});

export const agentLaunchesResource = defineResource(agentLaunchesDescriptor, {
  // A launch row's PK is its own identity, so a direct `agent_launches` UPDATE
  // scopes to that launch. Cross-table changes (a conversation's status, which
  // drives `latestConversationStatus`) arrive through the affectedMap edge below.
  identityTable: "agent_launches",
  dependsOn: compileEdges([
    // Relies on conversationsActiveResource's loader reading the whole
    // `conversations` table, so the L4 feed delivers every conversation change
    // here scoped to its id (the derived edge fires on the delivered set).
    //
    // A changed conversation affects every launch sharing its task. The old
    // hand-written closure did a conv→attempt→task→launch 3-table join; this
    // collapses to TWO hops because `conversations_v` already carries `taskId`
    // (via its inner join to attempts), producing the identical launch-id set:
    //   conv id → task id (conversations_v) → launch id (_agent_launches).
    //
    // `signature` (relevance gate): skip the cascade when a conversation write
    // touched only transient fields (waitingFor/updatedAt/lastViewedAt) —
    // agent-launches displays just the latest conversation's title/status, so
    // those writes produced empty deltas on every poller tick. Real status/title
    // changes still flow through (they're in the signature).
    rel(
      conversationsActiveResource,
      [
        { via: conversationsView, from: conversationsView.id, to: conversationsView.taskId }, // conv → task
        { via: _agent_launches, from: _agent_launches.taskId, to: _agent_launches.id }, // task → launch
      ],
      { signature: conversationCascadeSignatures },
    ),
  ]),
  loader: async (_params, ctx): Promise<AgentLaunchWithStatus[]> => {
    const ids = ctx?.affectedIds;
    const launches = ids
      ? await db
          .select()
          .from(_agent_launches)
          .where(inArray(_agent_launches.id, [...ids]))
      : await db.select().from(_agent_launches).orderBy(asc(_agent_launches.createdAt));
    // The per-task latest non-system conversation is pre-materialized in the
    // `task_latest_conversation` rollup (trigger-maintained + boot-reconciled),
    // so this is an indexed point-lookup join instead of re-deriving the whole
    // per-task latest map from a full `conversations_v` scan on every recompute.
    // Scope to just the affected launches' tasks when scoped; otherwise read all.
    const taskIds = [...new Set(launches.map((l) => l.taskId))];
    const rollupRows = ids
      ? taskIds.length > 0
        ? await db
            .select()
            .from(_task_latest_conversation)
            .where(inArray(_task_latest_conversation.taskId, taskIds))
        : []
      : await db.select().from(_task_latest_conversation);
    const latestByTask = new Map<string, AgentLaunchConversationRef>();
    for (const r of rollupRows) {
      latestByTask.set(r.taskId, {
        id: r.conversationId,
        title: r.title,
        status: r.status as AgentLaunchConversationRef["status"],
      });
    }
    return launches.map((l) => {
      const latest = latestByTask.get(l.taskId) ?? null;
      return {
        ...l,
        latestConversationStatus: latest?.status ?? null,
        latestConversation: latest,
      };
    });
  },
});
