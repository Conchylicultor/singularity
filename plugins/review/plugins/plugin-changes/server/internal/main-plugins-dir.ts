import { dirname, join, resolve } from "node:path";
import { REPO_ROOT, GIT } from "@plugins/infra/plugins/paths/server";

let cachedMainPluginsDir: string | null = null;
let cachedMainRoot: string | null = null;

export async function getMainRoot(): Promise<string> {
  if (cachedMainRoot) return cachedMainRoot;

  const proc = Bun.spawn(
    [GIT, "--no-optional-locks", "rev-parse", "--git-common-dir"],
    { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" },
  );
  const [out, code] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error("Failed to resolve git common dir");

  const absGitDir = resolve(REPO_ROOT, out.trim());
  cachedMainRoot = dirname(absGitDir);
  return cachedMainRoot;
}

export async function getMainPluginsDir(): Promise<string> {
  if (cachedMainPluginsDir) return cachedMainPluginsDir;
  cachedMainPluginsDir = join(await getMainRoot(), "plugins");
  return cachedMainPluginsDir;
}
