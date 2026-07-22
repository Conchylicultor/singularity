import { existsSync, readFileSync } from "fs";
import { relative } from "path";
import {
  renderDataViewsManifest,
  dataViewsManifestPath,
} from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

const check: Check = {
  id: "data-views-in-sync",
  description:
    "plugins/primitives/plugins/data-view/shared/data-views.generated.ts matches the current defineDataView ids",
  async run() {
    const root = await getWorktreeRoot();
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
