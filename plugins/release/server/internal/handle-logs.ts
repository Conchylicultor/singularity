import { readFileSync } from "node:fs";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { worktreeArtifacts } from "@plugins/infra/plugins/paths/server";
import { releaseLogsEndpoint, type ReleaseLogLine } from "../../core/endpoints";

interface ReleaseLogsFile {
  exitCode: number;
  lines: ReleaseLogLine[];
}

// Read the persisted per-run fallback artifact. Returns null when no artifact
// exists (a still-running or successful run — the live `/ws/logs` stream covers
// those).
function readReleaseRunLogs(releaseId: string): ReleaseLogsFile | null {
  const name = process.env.SINGULARITY_WORKTREE;
  if (!name) return null;
  const path = worktreeArtifacts.releaseLogs(name, releaseId);
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as ReleaseLogsFile;
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code !== "ENOENT" &&
      !(err instanceof SyntaxError)
    )
      throw err;
    return null;
  }
}

export const handleReleaseLogs = implement(releaseLogsEndpoint, ({ params }) => {
  const releaseId = params.id;
  if (!releaseId) throw new HttpError(400, "Missing id");
  const logs = readReleaseRunLogs(releaseId);
  return { lines: logs?.lines ?? [] };
});
