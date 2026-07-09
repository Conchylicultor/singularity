import { listSessionChain } from "@plugins/conversations/plugins/session-chain/server";
import { getConversationClaudeSessionId } from "@plugins/tasks/plugins/tasks-core/server";
import { findTranscriptPath } from "./find-transcript-path";

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

  const paths: string[] = [];
  for (const sessionId of sessionIds) {
    const path = await findTranscriptPath(sessionId);
    if (path) paths.push(path);
  }
  return paths;
}
