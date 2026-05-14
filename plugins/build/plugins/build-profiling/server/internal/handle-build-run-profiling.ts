import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

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
  try {
    const path = join(
      SINGULARITY_DIR,
      "worktrees",
      `${name}-build-profile-${buildId}.json`,
    );
    return JSON.parse(readFileSync(path, "utf-8")) as BuildProfile;
  } catch {
    return null;
  }
}

export function handleBuildRunProfiling(req: Request): Response {
  const url = new URL(req.url);
  const segments = url.pathname.split("/");
  const buildId = segments[4] ?? "";
  if (!buildId) return Response.json({ spans: [], totalMs: 0 });

  const profile = readBuildRunProfile(buildId);
  return Response.json({
    spans: profile?.spans ?? [],
    totalMs: profile?.totalDurationMs ?? 0,
  });
}
