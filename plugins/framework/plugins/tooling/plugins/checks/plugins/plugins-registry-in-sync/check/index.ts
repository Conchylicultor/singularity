import { existsSync, readFileSync } from "fs";
import { relative } from "path";
import {
  discoverCollectedDirs,
  renderCollectedDirRegistry,
  collectedDirRegistryPath,
  buildRegistryGenContext,
} from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

const check: Check = {
  id: "plugins-registry-in-sync",
  description:
    "All collected dir registries (web, server, central, check, lint, ...) match the current plugin source",
  async run() {
    const root = await getWorktreeRoot();
    const ctx = await buildRegistryGenContext(root);
    const defs = discoverCollectedDirs(root);
    for (const def of defs) {
      const file = collectedDirRegistryPath(def);
      const rel = relative(root, file);
      if (!existsSync(file)) {
        return {
          ok: false,
          message: `${rel} is missing`,
          hint: "Run `./singularity build` to generate it.",
        };
      }
      if (readFileSync(file, "utf8") !== renderCollectedDirRegistry({ ctx, def })) {
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
