import type { AvatarSpec } from "@plugins/fields/plugins/avatar/core";
import { conversationPreprompt } from "./tables";
import { conversationPrepromptsResource } from "./resource";

// Upsert the launch-time preprompt snapshot for a conversation and notify the
// live-state resource so the header chip re-renders.
export async function recordConversationPreprompt(
  conversationId: string,
  data: { prepromptId: string; title: string; text: string; icon: AvatarSpec | null },
): Promise<void> {
  await conversationPreprompt.upsert(conversationId, data);
  conversationPrepromptsResource.notify();
}
