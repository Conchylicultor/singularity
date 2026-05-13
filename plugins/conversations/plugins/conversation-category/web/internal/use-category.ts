import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationCategoriesResource } from "@plugins/conversations/plugins/conversation-category/shared";

export function useCategoryFor(conversationId: string): string | null {
  const { data } = useResource(conversationCategoriesResource);
  const row = data.find((r) => r.conversationId === conversationId);
  return row?.category ?? null;
}
