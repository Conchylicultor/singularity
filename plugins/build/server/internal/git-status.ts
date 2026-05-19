import { REPO_ROOT } from "@plugins/infra/plugins/paths/server";

// Local-main only: the git-watcher plugin guarantees that any movement of
// `refs/heads/main` triggers a refAdvanced emit, which both fans out to the
// auto-build job and notifies `mainAheadCountResource`. There's no need to
// `git fetch origin main` here — `./singularity push` always merges into
// local main before pushing, so a remote-only commit means a user pulled or
// merged externally and that pull will itself bump local main.
export async function getMainAheadCount(): Promise<number> {
  let base = "HEAD";
  try {
    const stored = (await Bun.file(`${REPO_ROOT}/plugins/framework/plugins/web-core/dist/.build-commit`).text()).trim();
    if (stored) base = stored;
  } catch {}
  const proc = Bun.spawnSync(["git", "log", `${base}..refs/heads/main`, "--oneline"], {
    cwd: REPO_ROOT,
  });
  if (proc.exitCode !== 0) return 0;
  const output = proc.stdout.toString().trim();
  return output ? output.split("\n").length : 0;
}
