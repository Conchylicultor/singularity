import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  conversationPrepromptsResource,
  type ConversationPreprompt,
} from "../../shared/schemas";

export function useConversationPreprompt(
  conversationId: string,
): ConversationPreprompt | null {
  const result = useResource(conversationPrepromptsResource);
  if (result.pending) return null;
  return result.data[conversationId] ?? null;
}
