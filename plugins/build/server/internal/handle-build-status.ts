import { createHash } from "node:crypto";

const repoRoot = import.meta.dir + "/../../../..";

export interface BuildStatusResponse {
  mainAheadCount: number;
  frontendHash: string;
}

export async function handleBuildStatus(_req: Request): Promise<Response> {
  const [mainAheadCount, frontendHash] = await Promise.all([
    getMainAheadCount(),
    getFrontendHash(),
  ]);
  return Response.json({ mainAheadCount, frontendHash } satisfies BuildStatusResponse);
}

function getMainAheadCount(): number {
  const proc = Bun.spawnSync(["git", "log", "HEAD..refs/heads/main", "--oneline"], {
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
