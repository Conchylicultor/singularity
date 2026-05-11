import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getProfilingData } from "@server/profiler";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

interface BuildSpan {
  id: string;
  phase: string;
  label: string;
  startMs: number;
  durationMs: number;
}

interface BuildProfile {
  spans: BuildSpan[];
  totalDurationMs: number;
}

function readBuildProfile(): BuildProfile | null {
  const name = process.env.SINGULARITY_WORKTREE;
  if (!name) return null;
  try {
    const path = join(SINGULARITY_DIR, "worktrees", `${name}-build-profile.json`);
    return JSON.parse(readFileSync(path, "utf-8")) as BuildProfile;
  } catch {
    return null;
  }
}

export function handleProfiling(_req: Request): Response {
  const server = getProfilingData();
  const build = readBuildProfile();
  return Response.json({
    buildSpans: build?.spans ?? [],
    buildTotalMs: build?.totalDurationMs ?? 0,
    serverSpans: server.spans,
    serverTotalMs: server.totalDurationMs,
  });
}
