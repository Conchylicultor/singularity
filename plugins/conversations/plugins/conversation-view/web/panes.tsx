import { useQuery } from "@tanstack/react-query";
import {
  fetchEndpoint,
  EndpointError,
} from "@plugins/infra/plugins/endpoints/web";
import {
  useResource,
  useCombinedResources,
} from "@plugins/primitives/plugins/live-state/web";
import { Pane, type ResolveResult } from "@plugins/primitives/plugins/pane/web";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import {
  conversationsActiveResource,
  conversationsGoneResource,
  conversationsSystemResource,
} from "@plugins/tasks/plugins/tasks-core/core";
import {
  getConversation,
  conversationRoute,
} from "@plugins/conversations/core";
import { useConversationById } from "@plugins/conversations/web";
import { ConversationView } from "./components/conversation-view";
import { ConversationTitle } from "./components/conversation-title";

function useResolveConversation({ convId }: { convId: string }): ResolveResult {
  const active = useResource(conversationsActiveResource);
  const gone = useResource(conversationsGoneResource);
  const system = useResource(conversationsSystemResource);
  const resource = useCombinedResources({ active, gone, system });

  const inLive =
    resource.status === "ready" &&
    [
      ...resource.data.active,
      ...resource.data.gone,
      ...resource.data.system,
    ].some((c) => c.id === convId);

  // Older gone conversations may not be in the live resource — check via REST.
  // A FAILED live read asks REST too: it answers found / not-found on its own,
  // so a broken subscription cannot leave the pane loading forever.
  const needsFallback =
    resource.status === "error" || (resource.status === "ready" && !inLive);
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

  if (resource.status === "loading") return { status: "pending" };
  if (inLive) return { status: "found" };
  if (fallback.isFetching) return { status: "pending" };
  // REST could not answer either: the failure, with Retry — never a Not Found
  // for a conversation that may well exist.
  if (fallback.isError) {
    return { status: "error", error: fallback.error, retry: fallback.refetch };
  }
  return { status: fallback.data === true ? "found" : "missing" };
}

export const conversationPane = Pane.define({
  route: conversationRoute,
  app: agentManagerApp,
  component: ConversationView,
  width: 600,
  useResolve: useResolveConversation,
  // Tab/document title: the conversation's name from the global live-state
  // resource. The header paints the richer ConversationTitle (same source).
  title: { useText: useConversationTitle, component: ConversationTitle },
  // Main surface: aux panes opened to the right (file peek, review, terminal)
  // never steal the tab title from the conversation.
  titleOwner: true,
});

/** The conversation's title from the global live-state resource, or undefined. */
function useConversationTitle({
  convId,
}: {
  convId: string;
}): string | undefined {
  return useConversationById(convId)?.title ?? undefined;
}
