import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationCategoriesResource } from "../../shared";

export function useCategoryFor(conversationId: string): string | null {
  const result = useResource(conversationCategoriesResource);
  if (result.pending) return null;
  const row = result.data.find((r) => r.conversationId === conversationId);
  return row?.category ?? null;
}
