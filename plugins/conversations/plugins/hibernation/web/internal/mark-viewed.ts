import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import type { ResumeOutcome } from "@plugins/conversations/core";
import { markViewed } from "../../shared/endpoints";

// Record that the user opened the conversation. Resets the idle timer and, if
// the conversation was hibernated, triggers a transparent server-side resume.
//
// Returns the resume outcome so the caller can surface the `blocked` arm. The
// resume is transparent when it works, not when it fails: a silent failure here
// is how a conversation ends up with no live session (or a session started in
// the wrong directory) while the UI shows nothing at all.
export async function markConversationViewed(
  id: string,
): Promise<ResumeOutcome> {
  return fetchEndpoint(markViewed, { id });
}
