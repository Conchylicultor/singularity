import type { AvatarSpec } from "@plugins/fields/plugins/avatar/core";
import { conversationPreprompt } from "./tables";

// Upsert the launch-time preprompt snapshot for a conversation. The DB
// change-feed invalidates the live-state resource so the header chip re-renders.
export async function recordConversationPreprompt(
  conversationId: string,
  data: { prepromptId: string; title: string; text: string; icon: AvatarSpec | null },
): Promise<void> {
  await conversationPreprompt.upsert(conversationId, data);
}
