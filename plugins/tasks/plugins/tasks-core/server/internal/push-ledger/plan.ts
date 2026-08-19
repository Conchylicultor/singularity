/**
 * Which ledger rows a git walk implies — pure, so the attribution and skip rules
 * are pinned by a test rather than inferred from a DB-backed run.
 */
import type { TrailerCommit } from "../../../core";
import type { InsertPushInput } from "../mutations/pushes";

/** What this database knows, against which a walk is attributed. */
export interface LedgerState {
  /** Shas the ledger already holds. */
  have: ReadonlySet<string>;
  /** conversationId → attemptId, for the conversations this database holds. */
  attemptByConversation: ReadonlyMap<string, string>;
  /** Attempt ids that exist here. */
  liveAttempts: ReadonlySet<string>;
}

/**
 * The rows `commits` implies and this database does not yet hold, oldest first.
 *
 * Oldest-first so a push's commits reach `pushes.landed` subscribers in the order
 * `main` recorded them; `readMainCommits` hands them over newest-first.
 *
 * A commit is skipped when its conversation or attempt is absent here. That is
 * not a failure: a worktree database forked before an attempt existed genuinely
 * has nothing to attach the push to, and inventing a row would break the FK.
 */
export function planLedgerRows(
  commits: readonly TrailerCommit[],
  state: LedgerState,
): InsertPushInput[] {
  const rows: InsertPushInput[] = [];
  for (let i = commits.length - 1; i >= 0; i--) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- index is in range by construction
    const commit = commits[i]!;
    if (state.have.has(commit.sha)) continue;
    const attemptId = state.attemptByConversation.get(commit.conversationId);
    if (!attemptId || !state.liveAttempts.has(attemptId)) continue;
    rows.push({
      // One push spans many commits, so the ledger's identity is the pair.
      id: `${commit.pushId}:${commit.sha}`,
      attemptId,
      conversationId: commit.conversationId,
      sha: commit.sha,
      pushId: commit.pushId,
      message: commit.subject,
      createdAt: commit.committedAt,
    });
  }
  return rows;
}
