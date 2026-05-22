import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";
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
  const worktreesDir = join(SINGULARITY_DIR, "worktrees");
  for (const path of [
    join(worktreesDir, name, "build-profile.json"),
    join(worktreesDir, `${name}-build-profile.json`),
  ]) {
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as BuildProfile;
    } catch {
      continue;
    }
  }
  return null;
}

export const handleBuildProfiling = implement(getBuildProfiling, () => {
  const build = readBuildProfile();
  return {
    spans: build?.spans ?? [],
    totalMs: build?.totalDurationMs ?? 0,
  };
});
