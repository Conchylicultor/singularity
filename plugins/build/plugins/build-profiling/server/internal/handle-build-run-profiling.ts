import { readFileSync } from "node:fs";
import { join } from "node:path";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";
import { getBuildRunProfile } from "../../shared/endpoints";

interface BuildProfile {
  spans: Array<{
    id: string;
    phase: string;
    label: string;
    startMs: number;
    durationMs: number;
  }>;
  totalDurationMs: number;
}

function readBuildRunProfile(buildId: string): BuildProfile | null {
  const name = process.env.SINGULARITY_WORKTREE;
  if (!name) return null;
  const path = join(
    SINGULARITY_DIR,
    "worktrees",
    name,
    `build-profile-${buildId}.json`,
  );
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as BuildProfile;
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code !== "ENOENT" &&
      !(err instanceof SyntaxError)
    )
      throw err;
    return null;
  }
}

export const handleBuildRunProfiling = implement(getBuildRunProfile, ({ params }) => {
  const buildId = params.id;
  if (!buildId) throw new HttpError(400, "Missing id");

  const profile = readBuildRunProfile(buildId);
  return {
    spans: profile?.spans ?? [],
    totalMs: profile?.totalDurationMs ?? 0,
  };
});
