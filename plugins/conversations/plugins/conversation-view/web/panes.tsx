import { useQuery } from "@tanstack/react-query";
import { fetchEndpoint, EndpointError } from "@plugins/infra/plugins/endpoints/web";
import { useResource, useCombinedResources } from "@plugins/primitives/plugins/live-state/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import {
  conversationsActiveResource,
  conversationsGoneResource,
  conversationsSystemResource,
} from "@plugins/tasks/plugins/tasks-core/core";
import { getConversation, conversationRoute } from "@plugins/conversations/core";
import { useConversationById } from "@plugins/conversations/web";
import { ConversationView } from "./components/conversation-view";

function useResolveConversation({ convId }: { convId: string }) {
  const active = useResource(conversationsActiveResource);
  const gone = useResource(conversationsGoneResource);
  const system = useResource(conversationsSystemResource);
  const resource = useCombinedResources({ active, gone, system });

  const inLive =
    !resource.pending &&
    [...resource.data.active, ...resource.data.gone, ...resource.data.system].some(
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
      } catch (err) {
        if (err instanceof EndpointError && err.status === 404) return false;
        throw err;
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
  route: conversationRoute,
  component: ConversationView,
  width: 600,
  resolve: useResolveConversation,
  // Tab/document title: the conversation's name from the global live-state
  // resource (same source as the header's ConversationTitle).
  useTitle: useConversationTitle,
});

/** The conversation's title from the global live-state resource, or undefined. */
function useConversationTitle({ convId }: { convId: string }): string | undefined {
  return useConversationById(convId)?.title ?? undefined;
}
