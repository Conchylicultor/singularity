import type { InAppRemovalRecord } from "@plugins/infra/plugins/worktree/server";

/**
 * How long an in-app removal record stays eligible to claim a disappearance.
 *
 * Generous because the record is written before the removal queues on the
 * host-wide mutate gate, so a contended removal can sit for minutes before its
 * directory actually goes. Bounded because an unbounded match would let one
 * real removal launder a later external deletion of a worktree that had since
 * been recreated under the same id.
 */
export const CORRELATION_WINDOW_MS = 10 * 60 * 1000;

export type Attribution = "in-app" | "external";

export interface DisappearanceVerdict {
  name: string;
  attribution: Attribution;
  /** The in-app removal claiming it, or null when nothing we did explains it. */
  claimedBy: InAppRemovalRecord | null;
}

/**
 * Names present in `before` and absent from `after`.
 *
 * Set difference rather than event inspection on purpose: a recursive delete
 * arrives as thousands of per-file events (and the ignore list drops most of
 * them), so "which top-level checkouts exist" is re-read from the filesystem
 * and diffed. The events are only a trigger, never the evidence.
 */
export function diffVanished(
  before: ReadonlySet<string>,
  after: ReadonlySet<string>,
): string[] {
  const gone: string[] = [];
  for (const name of before) {
    if (!after.has(name)) gone.push(name);
  }
  return gone.sort();
}

/**
 * Decide whether a vanished checkout is explained by a removal this process
 * performed. An `external` verdict is the signal worth acting on: it means the
 * checkout went away and no `removeWorktree` call in this backend accounts for
 * it.
 */
export function classifyDisappearance(
  name: string,
  recentRemovals: readonly InAppRemovalRecord[],
): DisappearanceVerdict {
  // Latest claimant wins: a worktree removed, recreated and removed again
  // should be attributed to the most recent removal, not the first.
  let claimedBy: InAppRemovalRecord | null = null;
  for (const record of recentRemovals) {
    if (record.id !== name) continue;
    if (!claimedBy || record.startedAt >= claimedBy.startedAt)
      claimedBy = record;
  }
  return {
    name,
    attribution: claimedBy ? "in-app" : "external",
    claimedBy,
  };
}
