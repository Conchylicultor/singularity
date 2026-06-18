import { existsSync, readFileSync } from "fs";
import { relative } from "path";
import {
  renderDataViewsManifest,
  dataViewsManifestPath,
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
  id: "data-views-in-sync",
  description:
    "plugins/primitives/plugins/data-view/shared/data-views.generated.ts matches the current defineDataView ids",
  async run() {
    const root = await getRoot();
    const file = dataViewsManifestPath(root);
    const rel = relative(root, file);
    if (!existsSync(file)) {
      return {
        ok: false,
        message: `${rel} is missing`,
        hint: "Run `./singularity build` to generate it.",
      };
    }
    if (readFileSync(file, "utf8") !== (await renderDataViewsManifest(root))) {
      return {
        ok: false,
        message: `${rel} is out of sync with the defineDataView ids`,
        hint: "Run `./singularity build` and commit the regenerated file.",
      };
    }
    return { ok: true };
  },
};

export default check;
