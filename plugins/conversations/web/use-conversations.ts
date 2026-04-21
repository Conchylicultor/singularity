import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useResource } from "@core";
import { z } from "zod";
import { ConversationSchema } from "../shared";
import { recentConversationsResource, type ConversationEntry } from "../shared/resources";

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
  const q = useResource(recentConversationsResource);
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

// Point lookup by id. Hits `GET /api/conversations/:id` on demand and caches
// per id — independent of `recentConversationsResource`, so it works for
// conversations older than the sidebar's bounded recent-gone window.
export function useConversationById(id: string | null): ConversationEntry | null {
  const q = useQuery({
    queryKey: ["conversation", id],
    queryFn: async (): Promise<ConversationEntry | null> => {
      const res = await fetch(`/api/conversations/${encodeURIComponent(id!)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Failed to fetch conversation ${id}: ${res.status}`);
      return ConversationSchema.parse(await res.json());
    },
    enabled: id !== null,
    staleTime: Infinity,
  });
  return q.data ?? null;
}
