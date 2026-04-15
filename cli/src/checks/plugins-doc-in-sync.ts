import { existsSync, readFileSync } from "fs";
import type { Check } from "./types";
import { pluginDocsPath, renderFullDoc } from "../docgen";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

export const pluginsDocInSync: Check = {
  id: "plugins-doc-in-sync",
  description: "docs/plugins.md matches the current plugin source",
  async run() {
    const root = await getRoot();
    const file = pluginDocsPath(root);
    if (!existsSync(file)) {
      return {
        ok: false,
        message: "docs/plugins.md is missing",
        hint: "Run `./singularity build` to generate it.",
      };
    }
    const existing = readFileSync(file, "utf8");
    const expected = renderFullDoc({ root });

    if (existing !== expected) {
      return {
        ok: false,
        message: "docs/plugins.md is out of sync with plugin source",
        hint: "Run `./singularity build` and commit the regenerated file.",
      };
    }
    return { ok: true };
  },
};
