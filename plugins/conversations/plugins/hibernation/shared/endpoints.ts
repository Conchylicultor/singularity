import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { ResumeOutcomeSchema } from "@plugins/conversations/core";

// User opened (selected) the conversation: reset its idle timer and, if it was
// hibernated, transparently resume the process before the user can type.
//
// The response is the resume outcome, not an `{ ok: true }` acknowledgement. The
// resume can legitimately fail (its worktree checkout was reclaimed while it
// slept) and this endpoint is the ONLY place that failure is observable — the
// browser fires it on every conversation open, so a response that could not
// express "blocked" meant a failed auto-resume looked identical to a successful
// one.
export const markViewed = defineEndpoint({
  route: "POST /api/conversations/:id/viewed",
  response: ResumeOutcomeSchema,
});
