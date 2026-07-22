import { desc } from "drizzle-orm";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { db } from "@plugins/database/server";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/server";
import { runGit, LOG_FORMAT, parseGitLog } from "@plugins/primitives/plugins/commit-list/server";
import { getBuildRunCommits } from "../../shared";
import { _buildRuns } from "@plugins/build/plugins/run-ledger/server";

export const handleBuildRunCommits = implement(getBuildRunCommits, async ({ params }) => {
  const buildId = params.id;
  if (!buildId) throw new HttpError(400, "Missing id");

  const runs = await db
    .select({
      id: _buildRuns.id,
      commitHash: _buildRuns.commitHash,
      exitCode: _buildRuns.exitCode,
      startedAt: _buildRuns.startedAt,
    })
    .from(_buildRuns)
    .orderBy(desc(_buildRuns.startedAt))
    .limit(50);

  const idx = runs.findIndex((r) => r.id === buildId);
  if (idx === -1) throw new HttpError(404, "Run not found");

  const thisRun = runs[idx]!;
  if (!thisRun.commitHash) return [];

  const prevRun = runs.slice(idx + 1).find((r) => r.commitHash != null && r.exitCode === 0) ?? null;

  const args = prevRun?.commitHash
    ? ["log", `--format=${LOG_FORMAT}`, `${prevRun.commitHash}..${thisRun.commitHash}`]
    : ["log", "--max-count=50", `--format=${LOG_FORMAT}`, thisRun.commitHash];

  // runGit throws on failure — a failed log must never be absorbed as an empty
  // commit list; the throw surfaces as an endpoint 500 (already-safe surface).
  const out = await runGit(args, REPO_ROOT);
  return parseGitLog(out);
});
