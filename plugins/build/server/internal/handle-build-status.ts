import { createHash } from "node:crypto";
import { lastAutoBuildAt } from "./build-run-job";

const repoRoot = import.meta.dir + "/../../../..";

export interface BuildStatusResponse {
  frontendHash: string;
  autoBuildAt: string | null;
}

export async function handleBuildStatus(_req: Request): Promise<Response> {
  const frontendHash = await getFrontendHash();
  return Response.json({ frontendHash, autoBuildAt: lastAutoBuildAt } satisfies BuildStatusResponse);
}

async function getFrontendHash(): Promise<string> {
  try {
    const content = await Bun.file(`${repoRoot}/web/dist/index.html`).text();
    return createHash("md5").update(content).digest("hex").slice(0, 8);
  } catch {
    return "";
  }
}
