import { useQuery } from "@tanstack/react-query";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { conversationsResource, getConversation } from "@plugins/conversations/core";
import { ConversationView } from "./components/conversation-view";

function useResolveConversation({ convId }: { convId: string }) {
  const resource = useResource(conversationsResource);

  const inLive =
    !resource.pending &&
    [...resource.data.active, ...resource.data.recentGone, ...resource.data.system].some(
      (c) => c.id === convId,
    );

  // Older gone conversations may not be in the live resource — check via REST.
  const needsFallback = !resource.pending && !inLive;
  const fallback = useQuery({
    queryKey: ["conversation-exists", convId],
    queryFn: async () => {
      try {
        await fetchEndpoint(getConversation, { id: convId });
        return true;
      } catch {
        return false;
      }
    },
    enabled: needsFallback,
    staleTime: Infinity,
    retry: false,
  });

  if (resource.pending) return { pending: true, found: false };
  if (inLive) return { pending: false, found: true };
  if (fallback.isFetching) return { pending: true, found: false };
  return { pending: false, found: !!fallback.data };
}

export const conversationPane = Pane.define({
  id: "conversation",
  segment: "c/:convId",
  component: ConversationView,
  width: 600,
  resolve: useResolveConversation,
});
