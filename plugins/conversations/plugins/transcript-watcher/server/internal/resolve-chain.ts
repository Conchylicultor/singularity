import { listSessionChain } from "@plugins/conversations/plugins/session-chain/server";
import { getConversationClaudeSessionId } from "@plugins/tasks/plugins/tasks-core/server";
import { resolveAnchoredChain } from "./anchor";
import { reportForeignSession } from "./foreign-session-report";

/**
 * The on-disk transcript files backing a conversation, oldest → newest.
 *
 * Composes the two halves the callers used to wire by hand: the recorded session
 * chain (`session-chain`, which knows nothing about files) and the projects-dir
 * glob (`findTranscriptPath`, which knows nothing about conversations).
 *
 * An **empty array is a legitimate value**: no session recorded yet, or Claude
 * has not written the transcript for a just-observed session id (the poller
 * records the id before the file lands). A chain entry whose file is missing is
 * dropped, preserving the order of the rest. Every other failure — a DB error,
 * a glob/permission error — THROWS.
 *
 * That distinction is the point. The six call sites this replaces each did
 * `getConversationClaudeSessionId` → `findTranscriptPath` → `return []`, so a
 * dead database and an empty conversation produced the same rendered answer.
 *
 * The chain ENRICHES a guaranteed floor, it is not the sole source of truth.
 * `conversations.claude_session_id` is always the live tail, and the poller only
 * appends to the chain when it observes a change on a live pane — so a row it
 * never revisits (already `done`, pane reaped, or simply never changing again)
 * can hold a valid session id with no chain row. Falling back to that column
 * keeps such a conversation readable, makes the backfill migration a recovery of
 * *history* rather than a prerequisite for rendering anything at all, and means
 * a chain wiped by hand degrades to today's single-file behaviour instead of a
 * blank pane.
 *
 * **A chain entry from another conversation is dropped, not merged.**
 * `resolveAnchoredChain` anchors the conversation to the projects dir of its
 * first resolvable session and refuses everything resolving elsewhere. A foreign
 * entry that survived to here would be merged into the rendered transcript, and
 * — worse — could be `paths.at(-1)`, which is what `rewindLastUserTurn`
 * truncates: the Stop button would destroy another agent's live transcript. Each
 * refusal is reported (debounced), because the DB row stays wrong until somebody
 * removes it. See `research/2026-08-19-global-pane-session-ownership.md`.
 */
export async function resolveConversationTranscriptPaths(
  conversationId: string,
): Promise<string[]> {
  const chain = await listSessionChain(conversationId);
  const sessionIds = chain.map((c) => c.claudeSessionId);

  if (sessionIds.length === 0) {
    // `undefined` = no such conversation; `null` = row exists, no session yet.
    const tail = await getConversationClaudeSessionId(conversationId);
    if (tail) sessionIds.push(tail);
  }

  const { anchorDir, kept, foreign } = await resolveAnchoredChain(sessionIds);

  // `foreign` is empty whenever nothing anchored, so this guard never actually
  // skips a report — it is how the compiler sees that `anchorDir` is a string
  // inside the loop, rather than a runtime branch.
  if (anchorDir !== null) {
    for (const entry of foreign) {
      reportForeignSession({
        reason: "directory-mismatch",
        conversationId,
        foreignSessionId: entry.sessionId,
        foreignDir: entry.dir,
        anchorDir,
      });
    }
  }

  return kept.map((entry) => entry.path);
}
