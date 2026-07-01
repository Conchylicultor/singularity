import { readFileSync } from "node:fs";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { worktreeArtifacts } from "@plugins/infra/plugins/paths/server";
import { getBuildRunProfileByWorktree } from "../../shared/endpoints";

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

// Defensive: these come from URL params and are joined into a filesystem path.
function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]/g, "");
}

function readProfile(worktree: string, buildId: string): BuildProfile | null {
  const name = sanitize(worktree);
  const id = sanitize(buildId);
  if (!name || !id) return null;
  const path = worktreeArtifacts.buildProfile(name, id);
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

export const handleBuildDetail = implement(
  getBuildRunProfileByWorktree,
  ({ params }) => {
    const { worktree, buildId } = params;
    if (!worktree || !buildId) throw new HttpError(400, "Missing params");
    const profile = readProfile(worktree, buildId);
    return {
      spans: profile?.spans ?? [],
      totalMs: profile?.totalDurationMs ?? 0,
    };
  },
);
