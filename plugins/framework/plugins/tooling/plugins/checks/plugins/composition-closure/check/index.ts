import { join } from "path";
import { readFileSync, existsSync } from "node:fs";
import { parse as parseJsonc } from "jsonc-parser";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { classifyEdges, resolveComposition } from "@plugins/plugin-meta/plugins/closure/core";
import {
  compositionsConfig,
  manifestItemToManifest,
} from "@plugins/plugin-meta/plugins/composition/core";
import { readTypedConfig } from "@plugins/config_v2/core";
import type { ConfigProxy, JsonValue } from "@plugins/config_v2/core";
import { asPath, asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import type { PluginId } from "@plugins/framework/plugins/plugin-id/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], { stdout: "pipe", stderr: "pipe" });
  return (await new Response(proc.stdout).text()).trim();
}

const HASH_RE = /^\/\/ @hash ([a-f0-9]+)\n/;

// Read-only fs-backed ConfigProxy for this build-time check. It runs in a Bun
// process with NO server runtime, so the server's `jsoncConfigProxy` is
// unavailable, and core can't host fs code (it is browser-bundled) — so we
// mirror `jsoncConfigProxy.read()`'s `// @hash`-header contract inline.
function fileConfigProxy(filePath: string): ConfigProxy {
  return {
    read() {
      if (!existsSync(filePath)) return null;
      const raw = readFileSync(filePath, "utf-8");
      const match = HASH_RE.exec(raw);
      if (!match) {
        throw new Error(
          `Config file is missing its "// @hash" header: ${filePath}. ` +
            `A hashless config file is corrupt — restore the header or delete the file.`,
        );
      }
      const body = raw.slice(match[0].length);
      return { content: parseJsonc(body) as JsonValue, hash: match[1]! };
    },
    write() {
      throw new Error("composition-closure fileConfigProxy is read-only");
    },
    exists() {
      return existsSync(filePath);
    },
  };
}

// The composition manifest registry now lives in a config_v2 config rather than a
// codegen barrel, so there is no `loadCompositions()` to call. This check runs in
// a separate Bun process with NO server runtime (`getConfig` is unavailable), so
// it reads the GIT-LAYER config straight off disk — the same off-server read path
// `config-origins-in-sync` uses. The config files sit at
// `config/<hierarchyPath>/<name>.{origin.,}jsonc`, where `hierarchyPath` is
// `asPath(pluginId)` (dots→slashes) — exactly the relPath key codegen's
// `renderConfigOriginContent` derives. The composition plugin's id is
// `plugin-meta.composition` → `plugin-meta/composition`; the config name is
// carried on the descriptor (`compositions`). We derive both via the canonical
// helpers rather than hardcoding the path string.
const COMPOSITION_PLUGIN_ID = asPluginId("plugin-meta.composition");

const fail = (message: string, hint?: string): CheckResult => ({ ok: false, message, hint });

const check: Check = {
  id: "composition-closure",
  description:
    "Every declared composition is valid: unique name, all entry/contributor ids resolve, and each selected contributor is a genuine, load-bearing soft option (no redundant selections).",
  async run() {
    const root = await getRoot();
    const tree = await buildPluginTree(join(root, "plugins"), { skipBarrelImport: true });
    const graph = classifyEdges(tree);
    const allIds = new Set<PluginId>([...tree.byDir.values()].map((n) => n.id));

    // Read the committed git-layer `compositions` config off disk. `readTypedConfig`
    // returns `descriptor.defaults` when neither file exists, so a fresh checkout
    // (before any `./singularity build` materializes the origin) still validates the
    // SEEDED defaults — intentional, no existence guard. Runtime-only (user-layer)
    // manifests are not closure-checked until promoted to the git layer.
    const configDir = join(root, "config", asPath(COMPOSITION_PLUGIN_ID));
    const originPath = join(configDir, `${compositionsConfig.name}.origin.jsonc`);
    const overridePath = join(configDir, `${compositionsConfig.name}.jsonc`);
    const values = readTypedConfig(
      compositionsConfig,
      fileConfigProxy(originPath),
      fileConfigProxy(overridePath),
    );
    const manifests = values.manifests.map(manifestItemToManifest);

    // 1. Unique names across all compositions (the config list does not de-dupe).
    const seenNames = new Set<string>();
    for (const m of manifests) {
      if (seenNames.has(m.name)) {
        return fail(
          `duplicate composition name "${m.name}"`,
          "Each manifest in the `compositions` config must declare a unique `name`.",
        );
      }
      seenNames.add(m.name);
    }

    for (const m of manifests) {
      // 2. Entry points: non-empty and every id resolves.
      if (m.entryPoints.length === 0) {
        return fail(`composition "${m.name}" has no entryPoints`);
      }
      for (const id of [...m.entryPoints, ...m.selectedContributors]) {
        if (!allIds.has(id)) {
          return fail(
            `composition "${m.name}" references unknown plugin id "${id}"`,
            "Ids are dot-encoded PluginIds (e.g. `apps.agent-manager`). Build via `asPluginId(...)` and confirm the plugin exists.",
          );
        }
      }

      const comp = resolveComposition(graph, m);

      // 3. No selection already locked in by the entries' hard edges.
      if (comp.redundantSelections.length > 0) {
        return fail(
          `composition "${m.name}" selects already-required contributor(s): ${comp.redundantSelections.join(", ")}`,
          "A contributor pulled in by the entry points' hard closure is included unconditionally — remove it from selectedContributors.",
        );
      }

      // 4. Every selected contributor must be a genuine, load-bearing soft option:
      //    deselecting it must remove it from the bundle (i.e. it is in the
      //    `available` frontier of the composition resolved without it). This rejects
      //    selections that are already pulled in via another contributor's hard
      //    closure, and selections that aren't soft contributors at all.
      for (const id of m.selectedContributors) {
        const without = resolveComposition(graph, {
          ...m,
          selectedContributors: m.selectedContributors.filter((x) => x !== id),
        });
        if (!without.available.includes(id)) {
          return fail(
            `composition "${m.name}" selects "${id}", which is not a genuine soft option`,
            "It is either not a soft contributor to this bundle, or it is already pulled in by another selection's hard closure. Remove it from selectedContributors.",
          );
        }
      }
    }

    return { ok: true };
  },
};

export default check;
