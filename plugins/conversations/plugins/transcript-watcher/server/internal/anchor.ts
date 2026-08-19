import { dirname } from "node:path";
import { findTranscriptPath } from "./find-transcript-path";

/** One resolvable session of a conversation's chain, with the dir it lives in. */
export interface AnchoredEntry {
  sessionId: string;
  /** Absolute path of the session's JSONL transcript. */
  path: string;
  /** The `~/.claude/projects/<dir>` the transcript sits in. */
  dir: string;
}

export interface AnchoredChain {
  /**
   * The projects dir every kept entry lives in — the first entry that resolved.
   * `null` when nothing in the chain resolved, in which case `kept` and
   * `foreign` are both empty.
   */
  anchorDir: string | null;
  /** Entries in the anchor dir, in chain order. */
  kept: AnchoredEntry[];
  /** Entries that resolved to some OTHER dir — they are somebody else's. */
  foreign: AnchoredEntry[];
}

/**
 * Partition a conversation's session chain into the sessions that are really
 * ITS OWN and the ones that belong to another conversation.
 *
 * The invariant: **all of a conversation's sessions run in one worktree**, so
 * all of its transcripts live in one `~/.claude/projects/<dir>/`. This is
 * enforced, not merely conventional — `plugins/conversations/server/internal/
 * lifecycle.ts` (`createConversation`, the `forkFromConversationId` branch)
 * rejects a fork whose `attemptId` differs from the source's and then assigns
 * `attemptId = source.attemptId`, and the worktree path comes from the attempt.
 * A conversation therefore cannot acquire a second worktree; a chain entry from
 * a second projects dir can only have arrived by mis-attribution.
 *
 * The FIRST id that resolves anchors the directory. Everything that resolves
 * elsewhere is `foreign`, whatever its position in the chain.
 *
 * **Why an anchor and not a derivation.** The obvious alternative is to compute
 * the expected directory from `attempts.worktree_path` through Claude's
 * cwd→dirname encoding (`/`, `_`, `.` → `-`). Do not. Nothing in this repo
 * re-implements that encoding, so nothing would tell us if Claude changed it —
 * and on the day it did, a re-derivation would match NOTHING and blank every
 * conversation in the app. The anchor has no such cliff: it is derived from the
 * files themselves, so its worst failure is resolving one fewer id (the same
 * outcome as a GC'd transcript, which this path already handles every day).
 * Visible-wrong is bad; silent-empty is worse — see
 * `research/2026-08-19-global-pane-session-ownership.md`.
 *
 * `resolvePath` is injectable for tests only; production always uses the
 * projects-dir glob.
 */
export async function resolveAnchoredChain(
  sessionIds: readonly string[],
  resolvePath: (
    sessionId: string,
  ) => Promise<string | null> = findTranscriptPath,
): Promise<AnchoredChain> {
  let anchorDir: string | null = null;
  const kept: AnchoredEntry[] = [];
  const foreign: AnchoredEntry[] = [];

  for (const sessionId of sessionIds) {
    const path = await resolvePath(sessionId);
    // Not on disk: Claude has not written it yet, or retention GC'd it. Neither
    // says anything about ownership, so such an entry anchors nothing and is
    // dropped — exactly as the read path has always dropped it.
    if (path === null) continue;

    const dir = dirname(path);
    anchorDir ??= dir;
    (dir === anchorDir ? kept : foreign).push({ sessionId, path, dir });
  }

  return { anchorDir, kept, foreign };
}
