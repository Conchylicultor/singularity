import { existsSync } from "fs";
import { readFile } from "fs/promises";
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
import { createTimeSlicer } from "@plugins/packages/plugins/macrotask-yield/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

/** A file's text, or null when it does not exist. */
async function readIfPresent(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

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
      (await readFile(compactFile, "utf8")) !==
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
      (await readFile(detailsFile, "utf8")) !==
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
    // One CLAUDE.md per plugin (~800): read each without blocking, and pause
    // every ~10 ms of rendering, so the loop never holds the check runner's
    // shared thread for the whole set.
    const slice = createTimeSlicer();
    for (const info of tree.byDir.values()) {
      await slice();
      const file = pluginClaudeMdPath(info);
      const existing = await readIfPresent(file);
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
