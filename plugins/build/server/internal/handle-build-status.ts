import { createHash } from "node:crypto";
import { lastAutoBuildAt } from "./build-run-job";
import { getMainAheadCount } from "./git-status";

const repoRoot = import.meta.dir + "/../../../..";

export interface BuildStatusResponse {
  mainAheadCount: number;
  frontendHash: string;
  autoBuildAt: string | null;
}

export async function handleBuildStatus(_req: Request): Promise<Response> {
  const [mainAheadCount, frontendHash] = await Promise.all([
    getMainAheadCount(),
    getFrontendHash(),
  ]);
  return Response.json({ mainAheadCount, frontendHash, autoBuildAt: lastAutoBuildAt } satisfies BuildStatusResponse);
}

async function getFrontendHash(): Promise<string> {
  try {
    const content = await Bun.file(`${repoRoot}/web/dist/index.html`).text();
    return createHash("md5").update(content).digest("hex").slice(0, 8);
  } catch {
    return "";
  }
}
