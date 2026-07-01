import { readFileSync } from "node:fs";
import { worktreeArtifacts } from "@plugins/infra/plugins/paths/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getBuildProfiling } from "../../shared/endpoints";

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

function readBuildProfile(): BuildProfile | null {
  const name = process.env.SINGULARITY_WORKTREE;
  if (!name) return null;
  const path = worktreeArtifacts.buildProfile(name);
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

export const handleBuildProfiling = implement(getBuildProfiling, () => {
  const build = readBuildProfile();
  return {
    spans: build?.spans ?? [],
    totalMs: build?.totalDurationMs ?? 0,
  };
});
