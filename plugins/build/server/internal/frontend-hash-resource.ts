import { createHash } from "node:crypto";
import { defineExternalResource } from "@plugins/framework/plugins/server-core/core";
import { WEB_DIST_DIR } from "@plugins/infra/plugins/paths/server";
import { FrontendHashSchema } from "../../shared";
import { buildLog } from "./build-log";
import { getServerBuildId } from "@plugins/build/plugins/server-build-id/server";

export const frontendHashResource = defineExternalResource({
  key: "build.frontendHash",
  mode: "push",
  schema: FrontendHashSchema,
  loader: async () => ({ hash: await getFrontendHash(), buildId: getServerBuildId() ?? "" }),
});

async function getFrontendHash(): Promise<string> {
  try {
    const content = await Bun.file(`${WEB_DIST_DIR}/index.html`).text();
    return createHash("md5").update(content).digest("hex").slice(0, 8);
  } catch (err) {
    // A running app is always serving this file, so a read failure means the
    // built frontend is missing or the path drifted — surface it instead of
    // silently returning "" (the empty hash that hid the stale-tab bug for so
    // long). Return "" so a transient error can't break the live-state sub; the
    // web side ignores an empty hash and simply won't arm the reload dot.
    buildLog.publish(
      `frontendHash: failed to read ${WEB_DIST_DIR}/index.html: ${err instanceof Error ? err.message : String(err)}`,
      "stderr",
    );
    return "";
  }
}
