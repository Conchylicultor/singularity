import { existsSync } from "fs";
import { join } from "path";
import type { Check } from "./types";
import { buildPluginTree } from "@packages/plugin-tree";
import { pluginClaudeMdPath } from "../docgen";

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

export const pluginsHaveClaudeMd: Check = {
  id: "plugins-have-claudemd",
  description: "every plugin has a CLAUDE.md (auto-generated, optionally with hand-written prose above the AUTOGEN fence)",
  async run() {
    const root = await getRoot();
    const tree = buildPluginTree(join(root, "plugins"));
    const missing: string[] = [];
    for (const info of tree.byDir.values()) {
      const file = pluginClaudeMdPath(info);
      if (!existsSync(file)) missing.push(file.replace(`${root}/`, ""));
    }
    if (missing.length > 0) {
      return {
        ok: false,
        message: `${missing.length} plugin(s) missing CLAUDE.md: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ", …" : ""}`,
        hint: "Run `./singularity build` to generate them.",
      };
    }
    return { ok: true };
  },
};
