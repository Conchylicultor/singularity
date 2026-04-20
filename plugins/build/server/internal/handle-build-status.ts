import { createHash } from "node:crypto";

const repoRoot = import.meta.dir + "/../../../..";

export interface BuildStatusResponse {
  mainAheadCount: number;
  frontendHash: string;
}

export async function handleBuildStatus(_req: Request): Promise<Response> {
  const [mainAheadCount, frontendHash] = await Promise.all([
    getMainAheadCountAsync(),
    getFrontendHash(),
  ]);
  return Response.json({ mainAheadCount, frontendHash } satisfies BuildStatusResponse);
}

async function getMainAheadCountAsync(): Promise<number> {
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

async function getFrontendHash(): Promise<string> {
  try {
    const content = await Bun.file(`${repoRoot}/web/dist/index.html`).text();
    return createHash("md5").update(content).digest("hex").slice(0, 8);
  } catch {
    return "";
  }
}
