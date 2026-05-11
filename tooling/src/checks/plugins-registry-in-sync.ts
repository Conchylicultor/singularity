import { existsSync, readFileSync } from "fs";
import { relative } from "path";
import type { Check } from "./types";
import {
  pluginRegistryPath,
  renderPluginRegistry,
  type Runtime,
} from "../plugin-registry-gen";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const RUNTIMES: Runtime[] = ["web", "server", "central"];

export const pluginsRegistryInSync: Check = {
  id: "plugins-registry-in-sync",
  description:
    "web/src/plugins.generated.ts, server/src/plugins.generated.ts, and central/src/plugins.generated.ts match the current plugin source",
  async run() {
    const root = await getRoot();
    for (const runtime of RUNTIMES) {
      const file = pluginRegistryPath(root, runtime);
      const rel = relative(root, file);
      if (!existsSync(file)) {
        return {
          ok: false,
          message: `${rel} is missing`,
          hint: "Run `./singularity build` to generate it.",
        };
      }
      if (readFileSync(file, "utf8") !== renderPluginRegistry({ root, runtime })) {
        return {
          ok: false,
          message: `${rel} is out of sync with plugin source`,
          hint: "Run `./singularity build` and commit the regenerated file.",
        };
      }
    }
    return { ok: true };
  },
};
