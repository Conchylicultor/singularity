import { existsSync } from "fs";
import { join, relative } from "path";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { asPath, asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import {
  registerBarrelStubs,
  importBarrel,
} from "@plugins/plugin-meta/plugins/barrel-import/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

// A config descriptor is stored under `${asPath(pluginId)}/${descriptor.name}.jsonc`,
// where `pluginId` is the contribution's explicit `pluginId` override (a plugin
// can plant a descriptor under ANOTHER plugin's hierarchy — e.g. reorder) else
// the registering plugin's own loader-injected id (the node's own dotted `id`).
// Both are dotted `PluginId`s; the on-disk store path is the slash form, so
// mirror `registry.ts` exactly by converting through `asPath`.
function storePathFor(
  override: string | undefined,
  fallbackId: string,
  descriptorName: string,
): string {
  return `${asPath(asPluginId(override ?? fallbackId))}/${descriptorName}.jsonc`;
}

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

type BarrelContribution = Record<string, unknown> & {
  _slotId?: string;
  _kind?: symbol;
  pluginId?: string;
  descriptor?: { name?: string };
};

const check: Check = {
  id: "config-v2:registrations-paired",
  description:
    "Every ConfigV2.Register (server) must have a matching ConfigV2.WebRegister (web) at the same storePath, and vice versa",
  async run() {
    const root = await getRoot();
    const pluginsRoot = join(root, "plugins");

    const tree = await buildPluginTree(pluginsRoot, { skipBarrelImport: true });
    registerBarrelStubs(join(pluginsRoot, ".."));

    const webPaths = new Set<string>();
    const serverPaths = new Set<string>();

    for (const node of tree.byDir.values()) {
      const fallbackId = node.id;

      const webIndex = join(node.dir, "web", "index.ts");
      if (existsSync(webIndex)) {
        let mod: Record<string, unknown>;
        try {
          mod = await importBarrel(webIndex);
        } catch (err) {
          return {
            ok: false,
            message: `Failed to import web barrel ${relative(root, webIndex)}: ${String(err)}`,
          };
        }
        const def = mod.default as
          | { contributions?: BarrelContribution[] }
          | undefined;
        for (const c of def?.contributions ?? []) {
          if (c._slotId !== "config-v2.web-register") continue;
          const name = c.descriptor?.name;
          if (typeof name !== "string") continue;
          webPaths.add(storePathFor(c.pluginId, fallbackId, name));
        }
      }

      const serverIndex = join(node.dir, "server", "index.ts");
      if (existsSync(serverIndex)) {
        let mod: Record<string, unknown>;
        try {
          mod = await importBarrel(serverIndex);
        } catch (err) {
          return {
            ok: false,
            message: `Failed to import server barrel ${relative(root, serverIndex)}: ${String(err)}`,
          };
        }
        const def = mod.default as
          | { contributions?: BarrelContribution[] }
          | undefined;
        for (const c of def?.contributions ?? []) {
          // Web contributions also live in def.contributions on the web side,
          // but the server `contributions[]` are ServerContributions tagged by
          // a `_kind` symbol. Positively identify config registrations by that
          // symbol's description rather than "has a descriptor".
          if (c._kind?.description !== "ConfigV2.Register") continue;
          const name = c.descriptor?.name;
          if (typeof name !== "string") continue;
          serverPaths.add(storePathFor(c.pluginId, fallbackId, name));
        }
      }
    }

    const webOnly = [...webPaths].filter((p) => !serverPaths.has(p)).sort();
    const serverOnly = [...serverPaths].filter((p) => !webPaths.has(p)).sort();

    if (webOnly.length === 0 && serverOnly.length === 0) return { ok: true };

    const parts: string[] = [];
    if (webOnly.length > 0) {
      parts.push(
        `${webOnly.length} config descriptor(s) registered on web (ConfigV2.WebRegister) but NOT on the server (no matching ConfigV2.Register) — these silently read back defaults at runtime:\n` +
          webOnly.map((p) => `    ${p}`).join("\n"),
      );
    }
    if (serverOnly.length > 0) {
      parts.push(
        `${serverOnly.length} config descriptor(s) registered on the server (ConfigV2.Register) but NOT on web (no matching ConfigV2.WebRegister) — useConfig throws for these at runtime:\n` +
          serverOnly.map((p) => `    ${p}`).join("\n"),
      );
    }

    return {
      ok: false,
      message: parts.join("\n\n"),
      hint: [
        webOnly.length > 0 &&
          "For each web-only storePath, add ConfigV2.Register({ descriptor }) (with the same pluginId override if used) to the defining plugin's server/index.ts contributions[].",
        serverOnly.length > 0 &&
          "For each server-only storePath, add ConfigV2.WebRegister({ descriptor }) (with the same pluginId override if used) to the defining plugin's web/index.ts contributions[].",
      ]
        .filter(Boolean)
        .join(" "),
    };
  },
};

export default check;
