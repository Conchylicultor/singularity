import type { ConversationStatus } from "../../core";

/**
 * What to do with a DB row whose live process is missing.
 * - `"hibernate"`: eligible candidate not yet hibernated → stamp `hibernatedAt`.
 * - `"leave-hibernated"`: eligible candidate already hibernated → leave alone.
 * - `"gone"`: ineligible (non-main, hibernation off, not `waiting`, or no
 *   resumable session) → mark disconnected.
 *
 * Eligibility (is this a hibernation candidate?) is deliberately SEPARATE from
 * the re-stamp guard (`hibernatedAt`). An already-hibernated row stays a
 * candidate and must be left untouched — its process is intentionally absent
 * forever, so folding `!hibernatedAt` into eligibility would flip every
 * hibernated conversation to "gone" ~1s after it was hibernated.
 */
export type MissingProcessAction = "hibernate" | "leave-hibernated" | "gone";

export function decideMissingProcessAction(
  row: { status: ConversationStatus; claudeSessionId: string | null; hibernatedAt: Date | null },
  opts: { onMain: boolean; hibernationEnabled: boolean },
): MissingProcessAction {
  const isCandidate =
    opts.onMain && opts.hibernationEnabled && row.status === "waiting" && !!row.claudeSessionId;
  if (!isCandidate) return "gone";
  return row.hibernatedAt ? "leave-hibernated" : "hibernate";
}
