import { readFileSync } from "node:fs";
import { join } from "node:path";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";
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
  try {
    const path = join(
      SINGULARITY_DIR,
      "worktrees",
      `${name}-build-logs-${buildId}.json`,
    );
    return JSON.parse(readFileSync(path, "utf-8")) as BuildLogsFile;
  } catch {
    return null;
  }
}

export const handleBuildRunLogs = implement(getBuildRunLogs, ({ params }) => {
  const buildId = params.id;
  if (!buildId) throw new HttpError(400, "Missing id");
  const logs = readBuildRunLogs(buildId);
  return { steps: logs?.steps ?? [] };
});
