import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { isMain } from "@plugins/infra/plugins/paths/server";
import { getConfig } from "@plugins/config_v2/server";
import {
  listHibernationCandidates,
  setConversationHibernated,
} from "@plugins/tasks/plugins/tasks-core/server";
import { deleteConversation } from "@plugins/conversations/server";
import { hibernationConfig } from "@plugins/conversations/core";

const HOUR_MS = 60 * 60 * 1000;

// Proactively reclaim resources held by long-idle waiting conversations: kill
// the tmux pane and mark the row hibernated (status stays `waiting`; it resumes
// transparently on open). Runs every 30 min on the main runtime only — tmux is a
// global host resource and only main owns the canonical conversation rows.
//
// Kill-first ordering is deliberate: if the job dies between deleteConversation
// and setConversationHibernated, the poller's suspend branch self-heals the row
// (it finds a waiting+resumable row with a missing session and hibernates it).
export const hibernateIdleJob = defineJob({
  name: "conversations.hibernate-idle",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "*/30 * * * *" },
  async run() {
    if (!isMain()) return;
    const cfg = getConfig(hibernationConfig);
    if (!cfg.enabled) return;

    const before = new Date(Date.now() - cfg.idleHours * HOUR_MS);
    const candidates = await listHibernationCandidates(before);
    for (const { id } of candidates) {
      await deleteConversation(id);
      await setConversationHibernated(id, new Date());
    }
  },
});
