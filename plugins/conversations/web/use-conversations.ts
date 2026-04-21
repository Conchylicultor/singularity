import { useMemo } from "react";
import { useResource } from "@core";
import { z } from "zod";
import { ConversationSchema } from "../shared/types";
import { conversationsResource, type ConversationEntry } from "../shared/resources";

const PayloadSchema = z.object({
  active: z.array(ConversationSchema),
  recentGone: z.array(ConversationSchema),
  hasMoreGone: z.boolean(),
});

export const GonePageSchema = z.object({
  items: z.array(ConversationSchema),
  hasMore: z.boolean(),
});

export function useConversations(): {
  active: ConversationEntry[];
  recentGone: ConversationEntry[];
  hasMoreGone: boolean;
  isLoading: boolean;
} {
  const q = useResource(conversationsResource);
  return useMemo(() => {
    if (!q.data) return { active: [], recentGone: [], hasMoreGone: false, isLoading: q.isLoading };
    const payload = PayloadSchema.parse(q.data);
    return { ...payload, isLoading: q.isLoading };
  }, [q.data, q.isLoading]);
}

export function useConversation(id: string): ConversationEntry | null {
  const { active, recentGone } = useConversations();
  return useMemo(
    () => [...active, ...recentGone].find((c) => c.id === id) ?? null,
    [active, recentGone, id],
  );
}
