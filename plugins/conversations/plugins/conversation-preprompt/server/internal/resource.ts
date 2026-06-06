import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  ConversationPrepromptsPayloadSchema,
  type ConversationPrepromptsPayload,
} from "../../shared/schemas";
import { conversationPreprompt } from "./tables";

const t = conversationPreprompt.table;

export const conversationPrepromptsResource = defineResource<ConversationPrepromptsPayload>({
  key: "conversation-preprompts",
  mode: "push",
  schema: ConversationPrepromptsPayloadSchema,
  loader: async () => {
    const rows = await db
      .select({
        conversationId: t.parentId,
        prepromptId: t.prepromptId,
        title: t.title,
        text: t.text,
        icon: t.icon,
        updatedAt: t.updatedAt,
      })
      .from(t);
    const out: ConversationPrepromptsPayload = {};
    for (const r of rows) out[r.conversationId] = r;
    return out;
  },
});
