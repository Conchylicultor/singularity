import { readFileSync } from "node:fs";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import {
  currentWorktreeName,
  worktreeArtifacts,
} from "@plugins/infra/plugins/paths/server";
import { readRunTerminal } from "@plugins/infra/plugins/jobs/plugins/supervised-run/core";
import { BUILD_RUN_KIND_ID } from "@plugins/build/plugins/run-ledger/core";
import { getBuildRunLogs } from "../../shared/endpoints";
import type { BuildStepLog } from "../../shared/endpoints";

/**
 * The build's own step transcript, written by the CLI from INSIDE the build.
 *
 * This is the half of `build-logs-<id>.json` that did NOT move to the
 * supervised-run primitive, and the distinction is worth stating because the
 * file did two jobs. Its `exitCode` + `finishedAt` were the terminal record the
 * backend recovered a killed build's outcome from; that job is now the exit
 * marker's, written by the shim for ANY command rather than by a CLI that
 * remembers to. Its `steps` are a structure only the build itself can know —
 * which phase each line belongs to, how long it took, whether it passed — so
 * there is nothing to move: the CLI already writes it, at every terminal it can
 * reach, and the primitive changes nothing about that.
 */
interface BuildLogsFile {
  steps: BuildStepLog[];
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

function readStepArtifact(buildId: string): BuildLogsFile | null {
  const raw = readIfPresent(
    worktreeArtifacts.buildLogs(currentWorktreeName(), buildId),
  );
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as BuildLogsFile;
  } catch (err) {
    // A truncated artifact is not worth taking the pane down for — it was
    // written by a process that no longer exists and cannot be repaired. The
    // transcript fallback below still has the raw output.
    if (!(err instanceof SyntaxError)) throw err;
    return null;
  }
}

/** The synthetic step's id, and the label the pane shows above the raw block. */
const RAW_STEP_ID = "raw";

/**
 * The whole build's output as ONE block, read from its supervised-run
 * transcript.
 *
 * **This replaces `recoverBuildArtifacts`, and replacing it is a strict gain.**
 * That helper was the SIGKILL backstop: a build hard-killed before its exit
 * handler ran writes no step artifact, so the backend reconstructed a one-step
 * stand-in from the lines it had captured off the child's pipe. Under the
 * supervised-run primitive there is no pipe — and there no longer needs to be,
 * because the child writes its merged output straight into the transcript file.
 * That file exists for EVERY build, including one whose spawning backend also
 * died, which is the case the old backstop could never cover: it required the
 * parent to have survived, and a build restarts its parent.
 *
 * So the recovery moved from the WRITE path to the READ path. Nothing
 * synthesises an artifact any more; this reads the two files the primitive
 * already owns and renders the same single honest block — the CLI's per-step
 * structure genuinely died with it, and inventing a shape it never reported
 * would be worse.
 *
 * `success` comes from the exit marker rather than being assumed, so a
 * hard-killed build's block is not shown with a green tick. No marker at all
 * (the SIGKILL case itself) is not a success.
 *
 * The `build-<id>.log` half of the old recovery is deliberately NOT replaced.
 * Its only purpose was to make the CLI's `Full output:` pointer resolve — and a
 * build that never ran its exit handler printed no verdict, so nothing points at
 * it.
 */
function readTranscriptAsStep(buildId: string): BuildStepLog | null {
  const text = readIfPresent(
    worktreeArtifacts.runTranscript(
      currentWorktreeName(),
      BUILD_RUN_KIND_ID,
      buildId,
    ),
  );
  if (text === null) return null;
  const lines = text.split("\n");
  // A transcript ends in a newline unless the child died mid-line, so the last
  // piece is usually empty — and a genuinely unterminated last line is the one
  // most worth keeping, so it is only the empty case that is dropped.
  if (lines.at(-1) === "") lines.pop();
  if (lines.length === 0) return null;
  const terminal = readRunTerminal(BUILD_RUN_KIND_ID, buildId);
  return {
    id: RAW_STEP_ID,
    label: "Build Output",
    // Every line reads as `stdout`: a supervised child's stdout and stderr share
    // one descriptor, so the interleaving survives and the classification does
    // not. The live view of the same bytes already says `stdout`.
    lines: lines.map((text) => ({ text, stream: "stdout" as const })),
    // Unknown. The step artifact is where per-step timings live; a number
    // invented here would be rendered beside the label as if it were measured.
    durationMs: 0,
    success: terminal?.exitCode === 0,
  };
}

/**
 * One build run's log pane: the CLI's own step transcript when it wrote one,
 * else the raw supervised-run transcript as a single block, else nothing.
 *
 * An empty list is a legitimate answer, and the client depends on it: the pane
 * falls back to the LIVE log channel when this returns none, which is what a
 * still-running build wants.
 *
 * Exported apart from the handler because it is the whole decision and it is
 * pure over two files on disk — which is what the tests beside it drive.
 */
export function buildRunLogSteps(buildId: string): BuildStepLog[] {
  const artifact = readStepArtifact(buildId);
  if (artifact !== null && artifact.steps.length > 0) return artifact.steps;
  const raw = readTranscriptAsStep(buildId);
  return raw === null ? [] : [raw];
}

export const handleBuildRunLogs = implement(getBuildRunLogs, ({ params }) => {
  const buildId = params.id;
  if (!buildId) throw new HttpError(400, "Missing id");
  return { steps: buildRunLogSteps(buildId) };
});
