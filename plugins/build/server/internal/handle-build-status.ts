import { createHash } from "node:crypto";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/server";
import { getLastAutoBuildAt } from "./auto-build-tracker";

export interface BuildStatusResponse {
  frontendHash: string;
  autoBuildAt: string | null;
}

export async function handleBuildStatus(_req: Request): Promise<Response> {
  const frontendHash = await getFrontendHash();
  return Response.json({ frontendHash, autoBuildAt: getLastAutoBuildAt() } satisfies BuildStatusResponse);
}

async function getFrontendHash(): Promise<string> {
  try {
    const content = await Bun.file(`${REPO_ROOT}/web/dist/index.html`).text();
    return createHash("md5").update(content).digest("hex").slice(0, 8);
  } catch {
    return "";
  }
}
