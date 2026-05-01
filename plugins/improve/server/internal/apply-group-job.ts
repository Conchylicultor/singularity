import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@server/db/client";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { addMemberToGroup } from "@plugins/conversations/plugins/conversations-view/plugins/grouped/server";
import { _improvePendingGroups } from "./tables";

export const applyGroupJob = defineJob({
  name: "improve.apply-group",
  input: z.object({}),
  event: z
    .object({
      conversationId: z.string(),
      taskId: z.string(),
    })
    .passthrough(),
  maxAttempts: 3,
  run: async ({ event }) => {
    if (!event?.taskId || !event?.conversationId) return;

    const [pending] = await db
      .select()
      .from(_improvePendingGroups)
      .where(eq(_improvePendingGroups.taskId, event.taskId))
      .limit(1);

    if (!pending) return;

    await db
      .delete(_improvePendingGroups)
      .where(eq(_improvePendingGroups.taskId, event.taskId));

    await addMemberToGroup(pending.groupId, event.conversationId);
  },
});
