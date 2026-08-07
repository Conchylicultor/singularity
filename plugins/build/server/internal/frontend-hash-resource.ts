import { createHash } from "node:crypto";
import { defineExternalResource } from "@plugins/framework/plugins/server-core/core";
import { webDistDir } from "@plugins/infra/plugins/paths/server";
import { frontendHashResource as frontendHashDescriptor } from "../../shared";
import { buildLog } from "./build-log";
import { getServerBuildId } from "@plugins/build/plugins/server-build-id/server";

export const frontendHashResource = defineExternalResource(
  frontendHashDescriptor,
  {
    mode: "push",
    loader: async () => ({
      hash: await getFrontendHash(),
      buildId: getServerBuildId() ?? "",
    }),
  },
);

async function getFrontendHash(): Promise<string> {
  // This backend's OWN namespace dist (`webDistDir()`), resolved per call — an
  // auto-served composition's backend runs out of main's checkout, so a
  // checkout-derived path would hash main's `index.html` and tell every tab on
  // that namespace it is stale/fresh according to main's build.
  const distDir = webDistDir();
  try {
    const content = await Bun.file(`${distDir}/index.html`).text();
    return createHash("md5").update(content).digest("hex").slice(0, 8);
    // eslint-disable-next-line promise-safety/no-absorbed-failure -- the read failure IS surfaced (buildLog.publish below); "" is a deliberate "hash unknown" sentinel the web treats as "don't arm the reload dot", chosen so a transient read error can't wedge the live-state sub
  } catch (err) {
    // A running app is always serving this file, so a read failure means the
    // built frontend is missing or the path drifted — surface it instead of
    // silently returning "" (the empty hash that hid the stale-tab bug for so
    // long). Return "" so a transient error can't break the live-state sub; the
    // web side ignores an empty hash and simply won't arm the reload dot.
    buildLog.publish(
      `frontendHash: failed to read ${distDir}/index.html: ${err instanceof Error ? err.message : String(err)}`,
      "stderr",
    );
    return "";
  }
}
