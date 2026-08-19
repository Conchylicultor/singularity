import {
  listSessionChain,
  listSharedClaudeSessionIds,
  type SharedSessionId,
} from "@plugins/conversations/plugins/session-chain/server";
import {
  resolveAnchoredChain,
  type AnchoredChain,
} from "@plugins/conversations/plugins/transcript-watcher/server";
import type { ForeignSessionPayload } from "@plugins/conversations/plugins/transcript-watcher/core";
import { listActiveConversations } from "@plugins/tasks/plugins/tasks-core/server";

/**
 * # Commission: an id in the chain that should not be there
 *
 * `./detect.ts` looks for an **omission** — a session the agent is talking in
 * that the chain never recorded. This file looks for the opposite: a session id
 * the chain DID record that belongs to somebody else. Same disease, opposite
 * symptom, and the omission detector is structurally blind to it — its very
 * first test is `if (recorded.has(sessionId)) continue`, so an id the resolver
 * wrongly *adopted* is skipped precisely because it was adopted. That blindness
 * is why the 2026-08-19 cross-talk incident (a lent background spare's session
 * id landing in an unrelated conversation's chain) was found by a human reading
 * a transcript, not by the monitor that exists to find exactly this.
 *
 * ## Why a separate file, and not a third clause of `detectDivergences`
 *
 * The two predicates do not take the same inputs and do not cover the same
 * conversations:
 *
 * - Omission needs the live process tree, the pane list, and the transcripts'
 *   mtimes. It can only speak about a conversation that still owns a live pane.
 * - Commission needs none of that. `detectDirectoryMismatches` reads the DB and
 *   the filesystem; `detectSharedSessionIds` reads the DB alone, so it answers
 *   for a **hibernated** conversation whose pane died days ago and whose
 *   transcripts have been swept.
 *
 * Folding them together would mean either running the process walk for
 * conversations that do not need it, or wrapping the (a)/(b)/(c) contract in
 * branches until "what does this function guarantee" no longer has an answer.
 * That contract is documented line by line and is the thing under test; it stays
 * one predicate over one input set. Two detectors, one report kind.
 *
 * Both file `conversation-foreign-session` (owned by `transcript-watcher`,
 * §2 of the research doc) rather than minting a kind of their own: the condition
 * is identical to the one the read path sees, and so is the answer — go delete
 * that `conversation_sessions` row. Returning the payload type directly, instead
 * of a private struct the job then maps, is what makes it impossible for a
 * detector to report a shape it did not actually observe.
 */
export interface CommissionDeps {
  listActiveConversations: () => Promise<Array<{ id: string }>>;
  listSessionChain: (
    conversationId: string,
  ) => Promise<Array<{ claudeSessionId: string }>>;
  anchoredChain: (sessionIds: readonly string[]) => Promise<AnchoredChain>;
  listSharedClaudeSessionIds: () => Promise<SharedSessionId[]>;
}

export const defaultCommissionDeps: CommissionDeps = {
  listActiveConversations,
  listSessionChain,
  anchoredChain: (sessionIds) => resolveAnchoredChain(sessionIds),
  listSharedClaudeSessionIds,
};

/**
 * Chain entries whose transcript resolves OUTSIDE their own conversation's
 * projects directory.
 *
 * All of a conversation's sessions run in one worktree — a fork must inherit its
 * source's attempt — so all of its transcripts live in one
 * `~/.claude/projects/<dir>/`. A second directory in one chain can only be
 * mis-attribution. `resolveAnchoredChain` is the same partition the read path
 * uses to decide which files to merge, so this detector reports exactly the
 * entries the UI is already refusing to render: the report is "the stored row is
 * still wrong", never "your transcript is wrong".
 *
 * Scoped to ACTIVE conversations. Resolving every id of every conversation that
 * ever existed is an unbounded glob over the projects tree on a 5-minute job,
 * and it would buy little: an entry can only mismatch if both transcripts still
 * exist, which for a long-dead conversation they usually do not.
 * `detectSharedSessionIds` covers the hibernated half with no filesystem at all.
 */
export async function detectDirectoryMismatches(
  deps: CommissionDeps = defaultCommissionDeps,
): Promise<ForeignSessionPayload[]> {
  const out: ForeignSessionPayload[] = [];
  for (const conv of await deps.listActiveConversations()) {
    const chain = await deps.listSessionChain(conv.id);
    if (chain.length < 2) continue; // one entry always anchors itself
    const { anchorDir, foreign } = await deps.anchoredChain(
      chain.map((e) => e.claudeSessionId),
    );
    for (const entry of foreign) {
      out.push({
        reason: "directory-mismatch",
        conversationId: conv.id,
        foreignSessionId: entry.sessionId,
        foreignDir: entry.dir,
        // Non-null by construction: an entry can only be `foreign` once some
        // earlier entry resolved and anchored the directory it differs from.
        anchorDir: anchorDir!,
      });
    }
  }
  return out;
}

/**
 * One `claude_session_id` recorded on two or more conversations.
 *
 * The stronger of the two signals for the 2026-08-19 incident shape, and the
 * cheaper: one indexed GROUP BY, no process table, no filesystem, no assumption
 * about how Claude encodes a cwd into a projects directory. It would have caught
 * that incident the minute it happened — both conversations recorded the id
 * within 0.5 s of each other — and it keeps catching it after the transcripts
 * are swept and the panes are gone.
 *
 * **One finding per holder, not one per id.** This detector can see that two
 * conversations claim the same session; it cannot see which of them really ran
 * it — that needs the transcript's directory, which is the other detector's
 * evidence and is exactly what a hibernated row no longer has. So it reports the
 * fact to every holder and lets triage decide which row to delete, rather than
 * guessing an impostor. The report kind is fingerprinted per
 * `(conversationId, foreignSessionId)`, so the two sides stay two rows — which
 * is right: repairing this means deleting one specific chain row.
 */
export async function detectSharedSessionIds(
  deps: CommissionDeps = defaultCommissionDeps,
): Promise<ForeignSessionPayload[]> {
  const out: ForeignSessionPayload[] = [];
  for (const shared of await deps.listSharedClaudeSessionIds()) {
    for (const conversationId of shared.conversationIds) {
      out.push({
        reason: "shared-session-id",
        conversationId,
        foreignSessionId: shared.claudeSessionId,
        otherConversationIds: shared.conversationIds.filter(
          (id) => id !== conversationId,
        ),
      });
    }
  }
  return out;
}
