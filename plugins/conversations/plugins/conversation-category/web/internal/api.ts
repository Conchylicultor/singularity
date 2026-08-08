import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  setConversationCategory,
  classifyConversation,
  clearConversationCategory,
} from "../../shared/endpoints";

export async function setCategoryItem(
  conversationId: string,
  categoryId: string,
  item: string,
): Promise<void> {
  await fetchEndpoint(
    setConversationCategory,
    { conversationId },
    { body: { categoryId, item } },
  );
}

export async function clearCategory(
  conversationId: string,
  categoryId: string,
): Promise<void> {
  await fetchEndpoint(clearConversationCategory, {
    conversationId,
    categoryId,
  });
}

/** Omit `categoryIds` to re-classify every category. */
export async function reclassify(
  conversationId: string,
  categoryIds?: string[],
): Promise<void> {
  await fetchEndpoint(
    classifyConversation,
    { conversationId },
    { body: { categoryIds } },
  );
}
