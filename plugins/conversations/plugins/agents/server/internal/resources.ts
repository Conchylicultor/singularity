import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  _attempts,
  _conversations,
  conversationCascadeSignatures,
  conversationsActiveResource,
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
  dependsOn: [
    {
      // Relies on conversationsActiveResource's loader reading the whole
      // `conversations` table, so the L4 feed delivers every conversation change
      // here scoped to its id (the affectedMap fires on the delivered set).
      resource: conversationsActiveResource,
      // Relevance gate: skip the cascade when a conversation write touched only
      // transient fields (waitingFor/updatedAt/lastViewedAt) — agent-launches
      // displays just the latest conversation's title/status, so those writes
      // produced empty deltas on every poller tick. Real status/title changes
      // still flow through (they're in the signature).
      signature: conversationCascadeSignatures,
      // A changed conversation affects every launch sharing its task. Map the
      // changed conversation ids → the launch ids for their tasks
      // (conversation → attempt → task → launch).
      affectedMap: async (convIds) => {
        const rows = await db
          .selectDistinct({ id: _agent_launches.id })
          .from(_agent_launches)
          .innerJoin(_attempts, eq(_attempts.taskId, _agent_launches.taskId))
          .innerJoin(_conversations, eq(_conversations.attemptId, _attempts.id))
          .where(inArray(_conversations.id, [...convIds]));
        return rows.map((r) => r.id);
      },
    },
  ],
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
