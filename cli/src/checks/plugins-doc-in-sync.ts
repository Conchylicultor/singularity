import { existsSync, readFileSync } from "fs";
import type { Check } from "./types";
import {
  buildPluginTree,
  pluginClaudeMdPath,
  pluginCompactDocPath,
  pluginDetailsDocPath,
  pluginRoutesDocPath,
  renderCompactDoc,
  renderDetailsDoc,
  renderPluginClaudeMd,
  renderRoutesDoc,
} from "../docgen";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

export const pluginsDocInSync: Check = {
  id: "plugins-doc-in-sync",
  description:
    "docs/plugins-compact.md, docs/plugins-details.md, docs/routes.md, and every plugin's CLAUDE.md AUTOGEN block match the current plugin source",
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

    if (readFileSync(compactFile, "utf8") !== renderCompactDoc({ root })) {
      return {
        ok: false,
        message: "docs/plugins-compact.md is out of sync with plugin source",
        hint: "Run `./singularity build` and commit the regenerated file.",
      };
    }
    if (readFileSync(detailsFile, "utf8") !== renderDetailsDoc({ root })) {
      return {
        ok: false,
        message: "docs/plugins-details.md is out of sync with plugin source",
        hint: "Run `./singularity build` and commit the regenerated file.",
      };
    }

    const routesFile = pluginRoutesDocPath(root);
    if (!existsSync(routesFile)) {
      return {
        ok: false,
        message: "docs/routes.md is missing",
        hint: "Run `./singularity build` to generate it.",
      };
    }
    if (readFileSync(routesFile, "utf8") !== renderRoutesDoc({ root })) {
      return {
        ok: false,
        message: "docs/routes.md is out of sync with plugin source",
        hint: "Run `./singularity build` and commit the regenerated file.",
      };
    }

    const tree = buildPluginTree(root);
    for (const info of tree.byDir.values()) {
      const file = pluginClaudeMdPath(info);
      const existing = existsSync(file) ? readFileSync(file, "utf8") : null;
      const expected = renderPluginClaudeMd(info, existing, root);
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
