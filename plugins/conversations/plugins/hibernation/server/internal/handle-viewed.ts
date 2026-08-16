import { implement } from "@plugins/infra/plugins/endpoints/server";
import { touchConversationViewed } from "@plugins/tasks/plugins/tasks-core/server";
import { ensureResumed } from "@plugins/conversations/server";
import { markViewed } from "../../shared/endpoints";

// The user opened the conversation: stamp lastViewedAt (resets the idle timer)
// and transparently resume it if it was hibernated (no-op otherwise).
//
// `ensureResumed`'s outcome is returned verbatim, including its `blocked` arm.
// A conversation that cannot be resumed keeps its status and its hibernation
// flag — the user's list is unchanged and the client renders the reason.
export const handleViewed = implement(markViewed, async ({ params }) => {
  await touchConversationViewed(params.id);
  return ensureResumed(params.id);
});
