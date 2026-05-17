import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationProgressResource } from "../../shared/schemas";
import type { ConversationProgress } from "../../shared/schemas";

export function useProgressFor(conversationId: string): ConversationProgress | null {
  const result = useResource(conversationProgressResource);
  if (result.pending) return null;
  return result.data.find((r) => r.conversationId === conversationId) ?? null;
}
