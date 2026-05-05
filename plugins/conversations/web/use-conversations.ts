import { useQuery } from "@tanstack/react-query";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { z } from "zod";
import { ConversationSchema } from "@plugins/tasks-core/shared";
import { recentConversationsResource, type ConversationEntry } from "../shared/resources";

export const GonePageSchema = z.object({
  items: z.array(ConversationSchema),
  hasMore: z.boolean(),
});

export function useConversations(): {
  active: ConversationEntry[];
  recentGone: ConversationEntry[];
  hasMoreGone: boolean;
  totalGoneCount: number;
  system: ConversationEntry[];
  isLoading: boolean;
} {
  const q = useResource(recentConversationsResource);
  return {
    active: q.data?.active ?? [],
    recentGone: q.data?.recentGone ?? [],
    hasMoreGone: q.data?.hasMoreGone ?? false,
    totalGoneCount: q.data?.totalGoneCount ?? 0,
    system: q.data?.system ?? [],
    isLoading: q.isLoading,
  };
}

export function useConversation(id: string): ConversationEntry | null {
  const { active, recentGone, system } = useConversations();
  return [...active, ...recentGone, ...system].find((c) => c.id === id) ?? null;
}

// Point lookup by id. Checks the live WS-backed resource first (real-time
// updates for recent conversations), falling back to a one-shot fetch for
// conversations older than the sidebar's bounded recent-gone window.
export function useConversationById(id: string | null): ConversationEntry | null {
  const liveConv = useConversation(id ?? "");
  const q = useQuery({
    queryKey: ["conversation", id],
    queryFn: async (): Promise<ConversationEntry | null> => {
      const res = await fetch(`/api/conversations/${encodeURIComponent(id!)}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Failed to fetch conversation ${id}: ${res.status}`);
      return ConversationSchema.parse(await res.json());
    },
    enabled: id !== null && liveConv === null,
    staleTime: Infinity,
  });
  return liveConv ?? q.data ?? null;
}
