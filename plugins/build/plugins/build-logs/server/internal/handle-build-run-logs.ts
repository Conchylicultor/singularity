import { readFileSync } from "node:fs";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { worktreeArtifacts } from "@plugins/infra/plugins/paths/server";
import { getBuildRunLogs } from "../../shared/endpoints";

interface BuildLogsFile {
  steps: Array<{
    id: string;
    label: string;
    lines: Array<{ text: string; stream: "stdout" | "stderr" }>;
    durationMs: number;
    success: boolean;
  }>;
}

function readBuildRunLogs(buildId: string): BuildLogsFile | null {
  const name = process.env.SINGULARITY_WORKTREE;
  if (!name) return null;
  const path = worktreeArtifacts.buildLogs(name, buildId);
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as BuildLogsFile;
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code !== "ENOENT" &&
      !(err instanceof SyntaxError)
    )
      throw err;
    return null;
  }
}

export const handleBuildRunLogs = implement(getBuildRunLogs, ({ params }) => {
  const buildId = params.id;
  if (!buildId) throw new HttpError(400, "Missing id");
  const logs = readBuildRunLogs(buildId);
  return { steps: logs?.steps ?? [] };
});
