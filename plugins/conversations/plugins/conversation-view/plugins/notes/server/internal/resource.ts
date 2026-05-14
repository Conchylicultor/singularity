import { db } from "@plugins/database/server";
import { defineResource } from "@server/resources";
import {
  ConversationNotesPayloadSchema,
  type ConversationNotesPayload,
} from "../../shared";
import { conversationNotes } from "./tables";

const t = conversationNotes.table;

export const conversationNotesResource =
  defineResource<ConversationNotesPayload>({
    key: "conversation-notes",
    mode: "push",
    schema: ConversationNotesPayloadSchema,
    loader: async () => {
      const rows = await db
        .select({
          conversationId: t.parentId,
          notes: t.notes,
          updatedAt: t.updatedAt,
        })
        .from(t);
      const out: ConversationNotesPayload = {};
      for (const r of rows) out[r.conversationId] = r;
      return out;
    },
  });
