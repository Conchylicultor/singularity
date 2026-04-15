import { useMemo } from "react";
import { useResource } from "@core";
import { z } from "zod";
import { ConversationSchema } from "../shared/types";
import { conversationsResource, type ConversationEntry } from "../shared/resources";

const EntrySchema = z.intersection(
  ConversationSchema,
  z.object({ working: z.boolean() }),
);
const EntryArraySchema = z.array(EntrySchema);

export function useConversations(): {
  conversations: ConversationEntry[];
  isLoading: boolean;
} {
  const q = useResource(conversationsResource);
  const conversations = useMemo<ConversationEntry[]>(() => {
    if (!q.data) return [];
    return EntryArraySchema.parse(q.data);
  }, [q.data]);
  return { conversations, isLoading: q.isLoading };
}

export function useConversation(id: string): ConversationEntry | null {
  const { conversations } = useConversations();
  return useMemo(
    () => conversations.find((c) => c.id === id) ?? null,
    [conversations, id],
  );
}
