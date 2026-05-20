import { createHash } from "node:crypto";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/server";
import { FrontendHashSchema } from "../../shared";

export const frontendHashResource = defineResource({
  key: "build.frontendHash",
  mode: "push",
  schema: FrontendHashSchema,
  loader: async () => ({ hash: await getFrontendHash() }),
});

async function getFrontendHash(): Promise<string> {
  try {
    const content = await Bun.file(`${REPO_ROOT}/web/dist/index.html`).text();
    return createHash("md5").update(content).digest("hex").slice(0, 8);
  } catch {
    return "";
  }
}
