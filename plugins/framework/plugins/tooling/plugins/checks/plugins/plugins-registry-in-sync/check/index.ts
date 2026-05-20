import { existsSync, readFileSync } from "fs";
import { relative } from "path";
import {
  pluginRegistryPath,
  renderPluginRegistry,
  type Runtime,
} from "@plugins/framework/plugins/tooling/plugins/codegen/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const RUNTIMES: Runtime[] = ["web", "server", "central"];

const check: Check = {
  id: "plugins-registry-in-sync",
  description:
    "plugins/framework/plugins/web-core/web/plugins.generated.ts, plugins/framework/plugins/server-core/bin/plugins.generated.ts, and plugins/framework/plugins/central-core/bin/plugins.generated.ts match the current plugin source",
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

export default check;
