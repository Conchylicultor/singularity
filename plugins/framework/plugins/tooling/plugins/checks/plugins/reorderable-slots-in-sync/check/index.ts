import { existsSync, readFileSync } from "fs";
import { relative } from "path";
import {
  renderReorderableSlotsManifest,
  reorderableSlotsManifestPath,
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

const check: Check = {
  id: "reorderable-slots-in-sync",
  description:
    "plugins/reorder/shared/reorderable-slots.generated.ts matches the current reorderable render slots",
  async run() {
    const root = await getRoot();
    const file = reorderableSlotsManifestPath(root);
    const rel = relative(root, file);
    if (!existsSync(file)) {
      return {
        ok: false,
        message: `${rel} is missing`,
        hint: "Run `./singularity build` to generate it.",
      };
    }
    if (readFileSync(file, "utf8") !== (await renderReorderableSlotsManifest(root))) {
      return {
        ok: false,
        message: `${rel} is out of sync with the reorderable render slots`,
        hint: "Run `./singularity build` and commit the regenerated file.",
      };
    }
    return { ok: true };
  },
};

export default check;
