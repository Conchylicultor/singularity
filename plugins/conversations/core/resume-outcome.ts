import { z } from "zod";

/**
 * Why a conversation cannot be resumed right now.
 *
 * - `worktree-missing` — the git checkout the session must run in is gone. The
 *   branch and the on-disk transcript both survive; only the working copy was
 *   reclaimed. Recreating the checkout brings the conversation back, so this is
 *   a repairable condition, never a reason to consider the conversation over.
 * - `no-session` — no Claude session id was ever persisted, so there is no
 *   transcript for `claude --resume` to reattach to.
 */
export const ResumeBlockedReasonSchema = z.enum([
  "worktree-missing",
  "no-session",
]);
export type ResumeBlockedReason = z.infer<typeof ResumeBlockedReasonSchema>;

/**
 * The outcome of a transparent (hibernation) resume attempt.
 *
 * A discriminated union rather than a bare `{ ok: true }`, because "there was
 * nothing to resume" and "this could not be resumed" are different answers that
 * the caller renders differently. Collapsing them is what let a failed
 * auto-resume pass for success: the browser fires this on every conversation
 * open and the endpoint reported `{ ok: true }` unconditionally, so a
 * conversation whose worktree had been reclaimed silently booted its agent in
 * `$HOME` with nothing surfaced to the user.
 *
 * The `blocked` arm never carries a status change with it — a conversation that
 * cannot be resumed stays exactly as it was (hibernated, still active, still
 * listed), because being temporarily unresumable is not the same as being done.
 */
export const ResumeOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("not-hibernated") }),
  z.object({ kind: z.literal("resumed") }),
  z.object({
    kind: z.literal("blocked"),
    reason: ResumeBlockedReasonSchema,
    message: z.string(),
  }),
]);
export type ResumeOutcome = z.infer<typeof ResumeOutcomeSchema>;

/** The `blocked` arm on its own — what a preflight check returns when it refuses. */
export type ResumeBlocked = Extract<ResumeOutcome, { kind: "blocked" }>;
