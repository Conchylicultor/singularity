import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationCategoriesResource } from "../../shared";

export function useCategoryFor(conversationId: string): string | null {
  const { data } = useResource(conversationCategoriesResource);
  if (!data) return null;
  const row = data.find((r) => r.conversationId === conversationId);
  return row?.category ?? null;
}
