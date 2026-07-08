import { REPO_ROOT, WEB_DIST_DIR } from "@plugins/infra/plugins/paths/server";
import { runGit, LOG_FORMAT, parseGitLog } from "@plugins/primitives/plugins/commit-list/server";
import type { MainAheadCount } from "../../shared";

// Local-main only: the git-watcher plugin guarantees that any movement of
// `refs/heads/main` triggers a refAdvanced emit, which both fans out to the
// auto-build job and notifies `mainAheadCountResource`. There's no need to
// `git fetch origin main` here — `./singularity push` always merges into
// local main before pushing, so a remote-only commit means a user pulled or
// merged externally and that pull will itself bump local main.
export async function getMainAhead(): Promise<MainAheadCount> {
  let base = "HEAD";
  const commitFile = Bun.file(`${WEB_DIST_DIR}/.build-commit`);
  if (await commitFile.exists()) {
    const stored = (await commitFile.text()).trim();
    if (stored) base = stored;
  }
  // runGit throws on failure — a false {count:0} (which hides the rebuild-needed
  // banner) is never manufactured. The throw propagates to the mainAheadCount
  // resource loader, which the live-state cascade treats as stale-safe.
  const out = await runGit(
    ["log", `--format=${LOG_FORMAT}`, `${base}..refs/heads/main`],
    REPO_ROOT,
  );
  const commits = parseGitLog(out);
  return { count: commits.length, commits };
}
