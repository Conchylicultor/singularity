import { useQuery } from "@tanstack/react-query";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { ConversationSchema } from "@plugins/tasks-core/core";
import { cursorPageSchema } from "@plugins/primitives/plugins/cursor-pagination/core";
import { fetchEndpoint, EndpointError } from "@plugins/infra/plugins/endpoints/web";
import { getConversation } from "../core/endpoints";
import { conversationsResource, type ConversationEntry } from "../core/resources";

export const GonePageSchema = cursorPageSchema(ConversationSchema);

export type ConversationsState =
  | { pending: true }
  | {
      pending: false;
      active: ConversationEntry[];
      recentGone: ConversationEntry[];
      hasMoreGone: boolean;
      totalGoneCount: number;
      system: ConversationEntry[];
    };

export function useConversations(): ConversationsState {
  const q = useResource(conversationsResource);
  if (q.pending) return { pending: true };
  return {
    pending: false,
    active: q.data.active,
    recentGone: q.data.recentGone,
    hasMoreGone: q.data.hasMoreGone,
    totalGoneCount: q.data.totalGoneCount,
    system: q.data.system,
  };
}

export function useConversation(id: string): ConversationEntry | null {
  const c = useConversations();
  if (c.pending) return null;
  return [...c.active, ...c.recentGone, ...c.system].find((x) => x.id === id) ?? null;
}

// Point lookup by id. Checks the live WS-backed resource first (real-time
// updates for recent conversations), falling back to a one-shot fetch for
// conversations older than the sidebar's bounded recent-gone window.
export function useConversationById(id: string | null): ConversationEntry | null {
  const liveConv = useConversation(id ?? "");
  const q = useQuery({
    queryKey: ["conversation", id],
    queryFn: async (): Promise<ConversationEntry | null> => {
      try {
        return await fetchEndpoint(getConversation, { id: id! });
      } catch (err) {
        if (err instanceof EndpointError && err.status === 404) return null;
        throw err;
      }
    },
    enabled: id !== null && liveConv === null,
    staleTime: Infinity,
  });
  return liveConv ?? q.data ?? null;
}
