import { existsSync, readFileSync } from "fs";
import {
  buildEnrichedTree,
  mainComposition,
  pluginClaudeMdPath,
  pluginCompactDocPath,
  pluginDetailsDocPath,
  renderCompactDoc,
  renderDetailsDoc,
  renderPluginClaudeMd,
  formatGenerated,
} from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

const check: Check = {
  id: "plugins-doc-in-sync",
  description:
    "docs/plugins-compact.md, docs/plugins-details.md, and every plugin's CLAUDE.md AUTOGEN block match the current plugin source",
  async run() {
    const root = await getWorktreeRoot();

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

    if (
      readFileSync(compactFile, "utf8") !==
      (await formatGenerated({
        file: compactFile,
        content: await renderCompactDoc({ root }),
      }))
    ) {
      return {
        ok: false,
        message: "docs/plugins-compact.md is out of sync with plugin source",
        hint: "Run `./singularity build` and commit the regenerated file.",
      };
    }
    if (
      readFileSync(detailsFile, "utf8") !==
      (await formatGenerated({
        file: detailsFile,
        content: await renderDetailsDoc({ root }),
      }))
    ) {
      return {
        ok: false,
        message: "docs/plugins-details.md is out of sync with plugin source",
        hint: "Run `./singularity build` and commit the regenerated file.",
      };
    }

    // The SAME inputs `generatePluginDocs` renders each CLAUDE.md from: the
    // enriched tree (memoized per root, so this is the very tree docgen used) and
    // the `singularity` composition resolved off it. The AUTOGEN block annotates
    // the plugins main's closure leaves out, so a check that computed membership
    // any other way would disagree with the generator it exists to check.
    const tree = await buildEnrichedTree(root);
    const main = mainComposition(tree, root);
    for (const info of tree.byDir.values()) {
      const file = pluginClaudeMdPath(info);
      const existing = existsSync(file) ? readFileSync(file, "utf8") : null;
      const expected = await formatGenerated({
        file,
        content: renderPluginClaudeMd(info, existing, root, tree.facets, main),
      });
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
