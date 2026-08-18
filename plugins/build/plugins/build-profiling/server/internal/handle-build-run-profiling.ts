import { readFileSync } from "node:fs";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import {
  currentWorktreeName,
  worktreeArtifacts,
} from "@plugins/infra/plugins/paths/server";
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
  const name = currentWorktreeName();
  const path = worktreeArtifacts.buildProfile(name, buildId);
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

export const handleBuildRunProfiling = implement(
  getBuildRunProfile,
  ({ params }) => {
    const buildId = params.id;
    if (!buildId) throw new HttpError(400, "Missing id");

    const profile = readBuildRunProfile(buildId);
    return {
      spans: profile?.spans ?? [],
      totalMs: profile?.totalDurationMs ?? 0,
    };
  },
);
