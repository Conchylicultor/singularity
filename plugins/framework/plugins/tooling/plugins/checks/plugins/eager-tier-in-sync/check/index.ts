import { existsSync, readFileSync } from "fs";
import { relative } from "path";
import {
  renderEagerTierManifest,
  eagerTierManifestPath,
} from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

const check: Check = {
  id: "eager-tier-in-sync",
  description:
    "plugins/framework/plugins/web-sdk/core/web-tiers.generated.ts matches the current derived load tiers (structural + watched-slot + bootCritical + dependsOn closure)",
  async run() {
    const root = await getWorktreeRoot();
    const file = eagerTierManifestPath(root);
    const rel = relative(root, file);
    if (!existsSync(file)) {
      return {
        ok: false,
        message: `${rel} is missing`,
        hint: "Run `./singularity build` to generate it.",
      };
    }
    // Rendering may throw the reachability guard (a bootCritical descriptor whose
    // owning plugin has no web entry). Surface it as a check failure with the fix,
    // not a crash, so push/build reports it cleanly.
    let expected: string;
    try {
      expected = await renderEagerTierManifest(root);
    } catch (err) {
      return {
        ok: false,
        message:
          err instanceof Error ? err.message : `Failed to derive load tiers: ${String(err)}`,
        hint: "A boot-critical resource descriptor is unreachable — see the message.",
      };
    }
    if (readFileSync(file, "utf8") !== expected) {
      return {
        ok: false,
        message: `${rel} is out of sync with the derived load tiers`,
        hint: "Run `./singularity build` and commit the regenerated file.",
      };
    }
    return { ok: true };
  },
};

export default check;
