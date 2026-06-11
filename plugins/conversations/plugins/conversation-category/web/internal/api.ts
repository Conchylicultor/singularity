import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { setConversationCategory, classifyConversation } from "../../shared/endpoints";

export async function setCategory(
  conversationId: string,
  category: string,
): Promise<void> {
  await fetchEndpoint(setConversationCategory, { conversationId }, { body: { category } });
}

export async function reclassify(conversationId: string): Promise<void> {
  await fetchEndpoint(classifyConversation, { conversationId });
}
