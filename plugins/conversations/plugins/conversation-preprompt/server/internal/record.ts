import { conversationPreprompt } from "./tables";
import { conversationPrepromptsResource } from "./resource";

// Upsert the launch-time preprompt snapshot for a conversation and notify the
// live-state resource so the header chip re-renders.
export async function recordConversationPreprompt(
  conversationId: string,
  data: { prepromptId: string; title: string; text: string },
): Promise<void> {
  await conversationPreprompt.upsert(conversationId, data);
  conversationPrepromptsResource.notify();
}
