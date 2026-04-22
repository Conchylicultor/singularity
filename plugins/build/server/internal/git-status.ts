const repoRoot = import.meta.dir + "/../../../..";

export async function getMainAheadCount(): Promise<number> {
  Bun.spawnSync(["git", "fetch", "origin", "main", "--quiet"], { cwd: repoRoot });
  let base = "HEAD";
  try {
    const stored = (await Bun.file(`${repoRoot}/web/dist/.build-commit`).text()).trim();
    if (stored) base = stored;
  } catch {}
  const proc = Bun.spawnSync(["git", "log", `${base}..origin/main`, "--oneline"], {
    cwd: repoRoot,
  });
  if (proc.exitCode !== 0) return 0;
  const output = proc.stdout.toString().trim();
  return output ? output.split("\n").length : 0;
}
