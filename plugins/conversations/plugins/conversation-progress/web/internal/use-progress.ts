import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationProgressResource } from "../../internal/schemas";
import type { ConversationProgress } from "../../internal/schemas";

export function useProgressFor(conversationId: string): ConversationProgress | null {
  const { data } = useResource(conversationProgressResource);
  return data.find((r) => r.conversationId === conversationId) ?? null;
}
