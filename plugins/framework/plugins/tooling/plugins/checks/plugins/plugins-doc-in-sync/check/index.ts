import { existsSync, readFileSync } from "fs";
import {
  buildEnrichedTree,
  pluginClaudeMdPath,
  pluginCompactDocPath,
  pluginDetailsDocPath,
  renderCompactDoc,
  renderDetailsDoc,
  renderPluginClaudeMd,
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
  id: "plugins-doc-in-sync",
  description:
    "docs/plugins-compact.md, docs/plugins-details.md, and every plugin's CLAUDE.md AUTOGEN block match the current plugin source",
  async run() {
    const root = await getRoot();

    const compactFile = pluginCompactDocPath(root);
    if (!existsSync(compactFile)) {
      return {
        ok: false,
        message: "docs/plugins-compact.md is missing",
        hint: "Run `./singularity build` to generate it.",
      };
    }
    const detailsFile = pluginDetailsDocPath(root);
    if (!existsSync(detailsFile)) {
      return {
        ok: false,
        message: "docs/plugins-details.md is missing",
        hint: "Run `./singularity build` to generate it.",
      };
    }

    if (readFileSync(compactFile, "utf8") !== await renderCompactDoc({ root })) {
      return {
        ok: false,
        message: "docs/plugins-compact.md is out of sync with plugin source",
        hint: "Run `./singularity build` and commit the regenerated file.",
      };
    }
    if (readFileSync(detailsFile, "utf8") !== await renderDetailsDoc({ root })) {
      return {
        ok: false,
        message: "docs/plugins-details.md is out of sync with plugin source",
        hint: "Run `./singularity build` and commit the regenerated file.",
      };
    }

    const tree = await buildEnrichedTree(root);
    for (const info of tree.byDir.values()) {
      const file = pluginClaudeMdPath(info);
      const existing = existsSync(file) ? readFileSync(file, "utf8") : null;
      const expected = renderPluginClaudeMd(info, existing, root, tree.facets);
      if (existing !== expected) {
        return {
          ok: false,
          message: `${file.replace(`${root}/`, "")} AUTOGEN block is out of sync with plugin source`,
          hint: "Run `./singularity build` and commit the regenerated file.",
        };
      }
    }

    return { ok: true };
  },
};

export default check;
