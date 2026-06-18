import { implement } from "@plugins/infra/plugins/endpoints/server";
import { touchConversationViewed } from "@plugins/tasks/plugins/tasks-core/server";
import { ensureResumed } from "@plugins/conversations/server";
import { markViewed } from "../../shared/endpoints";

// The user opened the conversation: stamp lastViewedAt (resets the idle timer)
// and transparently resume it if it was hibernated (no-op otherwise).
export const handleViewed = implement(markViewed, async ({ params }) => {
  await touchConversationViewed(params.id);
  await ensureResumed(params.id);
  return { ok: true as const };
});
