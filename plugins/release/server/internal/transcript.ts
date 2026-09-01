import { readFileSync } from "node:fs";
import {
  currentWorktreeName,
  worktreeArtifacts,
} from "@plugins/infra/plugins/paths/server";
import type { ReleaseLogLine } from "../../core/endpoints";
import { RELEASE_RUN_KIND_ID } from "./kind-id";

/**
 * Every line one release run wrote, read back from its transcript file.
 *
 * **This replaces `release-logs-<id>.json`, and the replacement is the point of
 * the migration rather than a side effect of it.** That artifact was written by
 * the PARENT, from lines it had accumulated off the CLI's pipe, and only when
 * the run failed. So it existed exactly when the parent survived the run — which
 * is the case that never needed it — and was absent for every run that was
 * genuinely orphaned, the case it was written for. Its other reader,
 * `resolveOrphanExitCode`, is deleted for the same reason.
 *
 * The transcript is written by the CHILD, through a kernel fd, for every run
 * whatever becomes of it. So this now answers for a successful run too (which
 * previously showed an empty log pane once its live stream ended) and for one
 * whose backend went away mid-flight.
 *
 * Two honest consequences:
 *
 * - **Every line reads as `stdout`.** A supervised child's stdout and stderr
 *   share one descriptor, so the interleaving survives and the per-line
 *   classification does not. This is not a claim invented here: the live view of
 *   the same bytes already says `stdout`, because the log channel defaults an
 *   unclassified line to it. The persisted view now agrees with the live one
 *   instead of contradicting it.
 * - **The whole file is read, not a tail.** A cap would have to drop the START
 *   of a release log, which is where its phase headers are, and the artifact it
 *   replaces was uncapped too. The file's own bound is the supervised-run
 *   artifact prune (newest 50 runs per kind).
 *
 * A missing transcript falls back to the legacy artifact (see
 * {@link readLegacyReleaseLogs}) and then to no lines. That is not a swallowed
 * failure — the prune reaps the oldest run sets, and a run whose transcript is
 * gone genuinely has nothing to show.
 */
export function readReleaseTranscript(releaseId: string): ReleaseLogLine[] {
  const path = worktreeArtifacts.runTranscript(
    currentWorktreeName(),
    RELEASE_RUN_KIND_ID,
    releaseId,
  );
  const text = readIfPresent(path);
  if (text === null) return readLegacyReleaseLogs(releaseId);
  const lines = text.split("\n");
  // A transcript ends in a newline unless the child died mid-line, so the last
  // piece is usually empty — and a genuinely unterminated last line is the one
  // most worth keeping, so it is only the empty case that is dropped.
  if (lines.at(-1) === "") lines.pop();
  return lines.map((line) => ({ text: line, stream: "stdout" as const }));
}

/** The shape the pre-supervision parent wrote into `release-logs-<id>.json`. */
interface LegacyReleaseLogsFile {
  exitCode: number;
  lines: ReleaseLogLine[];
}

/**
 * LEGACY, read-only: the log pane of a release cut BEFORE this plugin moved onto
 * the supervised-run primitive.
 *
 * Nothing writes this file any more, so it is not the two-paths trap the
 * transcript exists to remove — that trap is a live path plus a recovery path,
 * where the recovery path rots because nothing exercises it until something has
 * already gone wrong. This reads a **fixed, closed set** of files that can only
 * shrink: the runs that produced them are already finished, and no new one will
 * ever appear. It also keeps the one thing the transcript genuinely cannot —
 * those lines carry a real stdout/stderr classification, because a pipe was
 * still what wrote them.
 *
 * **Ages out.** Delete this function, and the `release-logs-*.json` artifact
 * family in `paths`, once no run old enough to have one is still worth reading
 * (the files are capped at ~50 per worktree and were only ever written for
 * FAILED runs, so the set is small and static).
 */
function readLegacyReleaseLogs(releaseId: string): ReleaseLogLine[] {
  const raw = readIfPresent(
    worktreeArtifacts.releaseLogs(currentWorktreeName(), releaseId),
  );
  if (raw === null) return [];
  try {
    return (JSON.parse(raw) as LegacyReleaseLogsFile).lines;
  } catch (err) {
    // A truncated legacy file is not worth taking the pane down for — it was
    // written by a process that no longer exists and cannot be repaired.
    if (!(err instanceof SyntaxError)) throw err;
    return [];
  }
}

/** Read a file, or null when it is not there. Any other fs error is a real fault. */
function readIfPresent(path: string): string | null {
  try {
    return readFileSync(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
