import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationProgressResource } from "@plugins/conversations/plugins/conversation-progress/shared/schemas";
import type { ConversationProgress } from "@plugins/conversations/plugins/conversation-progress/shared/schemas";

export function useProgressFor(conversationId: string): ConversationProgress | null {
  const { data } = useResource(conversationProgressResource);
  return data.find((r) => r.conversationId === conversationId) ?? null;
}
