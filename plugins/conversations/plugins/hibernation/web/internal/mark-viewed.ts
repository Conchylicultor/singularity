import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { markViewed } from "../../shared/endpoints";

// Record that the user opened the conversation. Resets the idle timer and, if
// the conversation was hibernated, triggers a transparent server-side resume.
export async function markConversationViewed(id: string): Promise<void> {
  await fetchEndpoint(markViewed, { id });
}
