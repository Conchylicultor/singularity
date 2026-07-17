import { join } from "path";
import { readFileSync, existsSync } from "node:fs";
import { parse as parseJsonc } from "jsonc-parser";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import {
  classifyEdges,
  explainInclusion,
  flattenManifest,
  resolveComposition,
} from "@plugins/plugin-meta/plugins/closure/core";
import type { CompositionManifest } from "@plugins/plugin-meta/plugins/closure/core";
import {
  compositionsConfig,
  manifestItemToManifest,
} from "@plugins/plugin-meta/plugins/composition/core";
import { readTypedConfig } from "@plugins/config_v2/core";
import type { ConfigProxy, JsonValue } from "@plugins/config_v2/core";
import { assertServableCompositionNamespace } from "@plugins/framework/plugins/tooling/plugins/codegen/core";
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
    "Every declared composition is valid: unique name, all entry/contributor ids resolve, each selected contributor is a genuine load-bearing soft option (no redundant selections), and every `excludes` bundle stays disjoint from the composition's hard closure (self-containment guard).",
  async run() {
    const root = await getRoot();
    const tree = await buildPluginTree(join(root, "plugins"), { skipBarrelImport: true, facets: true });
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

    // 0. Every manifest id is a servable gateway namespace: the compose-serve
    //    stage uses the id verbatim as the subdomain / spec-dir / DB name, so
    //    the gateway name rule (charset, ≤63 chars) and the reserved namespaces
    //    (central / singularity / main) apply to every id — enforced via the
    //    canonical helper, never a duplicated regex.
    for (const item of values.manifests) {
      try {
        assertServableCompositionNamespace(item.id);
      } catch (err) {
        return fail(
          `composition "${item.name}" has an unservable id "${item.id}": ${err instanceof Error ? err.message : String(err)}`,
          "Composition ids double as gateway namespaces (http://<id>.localhost:9000). Rename the composition.",
        );
      }
    }

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
    const allNames = seenNames;

    for (const m of manifests) {
      // 2. Every id (own entry + own contributor) resolves to a real plugin.
      for (const id of [...m.entryPoints, ...m.selectedContributors]) {
        if (!allIds.has(id)) {
          return fail(
            `composition "${m.name}" references unknown plugin id "${id}"`,
            "Ids are dot-encoded PluginIds (e.g. `apps.agent-manager`). Build via `asPluginId(...)` and confirm the plugin exists.",
          );
        }
      }

      // 3. Every `extends` reference resolves to a real composition name.
      for (const ref of m.extends ?? []) {
        if (!allNames.has(ref)) {
          return fail(
            `composition "${m.name}" extends unknown composition "${ref}"`,
            "`extends` lists other composition NAMES (typically packs). Confirm the referenced composition exists.",
          );
        }
      }

      // A composition with NO entry points is a pure contributor SET (a pack):
      // its contributors only become genuine soft options inside an app that
      // `extends` it, so it carries no bundle context to validate standalone.
      // Validity for those ids is enforced where the pack is folded in (below).
      if (m.entryPoints.length === 0) continue;

      // Non-pack: validate against the FLATTENED manifest (own + extended packs'
      // entries/contributors unioned), so a profile's `extends` packs are checked
      // in the app's real bundle context.
      const flat = flattenManifest(m, manifests);
      const comp = resolveComposition(graph, flat);

      // 4. No selection already locked in by the entries' hard edges.
      if (comp.redundantSelections.length > 0) {
        return fail(
          `composition "${m.name}" selects already-required contributor(s): ${comp.redundantSelections.join(", ")}`,
          "A contributor pulled in by the entry points' hard closure is included unconditionally — remove it from selectedContributors (or from the extended pack).",
        );
      }

      // 5. Every selected contributor must be a genuine, load-bearing soft option:
      //    deselecting it must remove it from the bundle (i.e. it is in the
      //    `available` frontier of the composition resolved without it). This rejects
      //    selections that are already pulled in via another contributor's hard
      //    closure, and selections that aren't soft contributors at all.
      for (const id of flat.selectedContributors) {
        const without = resolveComposition(graph, {
          ...flat,
          selectedContributors: flat.selectedContributors.filter((x) => x !== id),
        });
        if (!without.available.includes(id)) {
          return fail(
            `composition "${m.name}" selects "${id}", which is not a genuine soft option`,
            "It is either not a soft contributor to this bundle, or it is already pulled in by another selection's hard closure. Remove it from selectedContributors (or from the extended pack).",
          );
        }
      }
    }

    // 6. `excludes` — the dual of `extends`: each named bundle's CONTAINMENT
    //    (its entries/contributors + their subtrees, NOT their hard deps) must be
    //    DISJOINT from this composition's resolved hard-closure bundle. This is
    //    the self-containment guard: an app excludes `agent-runtime` (and `auth`,
    //    on demand) to assert its release pulls in no agent/worktree/git infra.
    //    Containment (not the excluded bundle's own closure) keeps generic shared
    //    infra usable, while taproots listed as the bundle's entries still catch
    //    transitive contamination — the app's hard closure surfaces any taproot.
    const byName = new Map<string, CompositionManifest>(
      manifests.map((m) => [m.name, m]),
    );

    // A bundle's containment: each (flattened) entry/contributor plus its
    // subtree — NOT its hard deps. Shared by the `excludes` disjointness gate
    // and the autoBuild warning below.
    const containmentOf = (target: CompositionManifest): Set<PluginId> => {
      const targetFlat = flattenManifest(target, manifests);
      const containment = new Set<PluginId>();
      for (const id of [...targetFlat.entryPoints, ...targetFlat.selectedContributors]) {
        containment.add(id);
        for (const descendant of graph.subtree.get(id) ?? []) containment.add(descendant);
      }
      return containment;
    };

    for (const item of values.manifests) {
      const excludes = item.excludes ?? [];
      if (excludes.length === 0) continue;

      const appFlat = flattenManifest(manifestItemToManifest(item), manifests);
      const appBundle = resolveComposition(graph, appFlat).bundle;

      for (const ref of excludes) {
        // Every `excludes` reference resolves to a real composition name.
        const target = byName.get(ref);
        if (!target) {
          return fail(
            `composition "${item.name}" excludes unknown composition "${ref}"`,
            "`excludes` lists other composition NAMES (the bundles this composition must stay disjoint from, e.g. `agent-runtime`). Confirm the referenced composition exists.",
          );
        }

        const containment = containmentOf(target);
        const offenders = [...appBundle].filter((p) => containment.has(p)).sort();
        if (offenders.length > 0) {
          const offender = offenders[0]!;
          const path = explainInclusion(graph, appFlat, offender);
          const trail = path
            ? path.steps.map((s) => `${s.from} →(${s.kind}) ${s.to}`).join("\n    ")
            : "(no path found)";
          return fail(
            `composition "${item.name}" excludes bundle "${ref}" but its closure includes ${offenders.length} plugin(s) from it: ${offenders.join(", ")}`,
            `"${item.name}" declares it must stay disjoint from "${ref}" (self-containment), but "${offender}" is pulled into its bundle. Remove the dependency, or drop "${ref}" from this composition's \`excludes\`. Inclusion path for "${offender}":\n    ${trail}`,
          );
        }
      }
    }

    // 7. WARNING (never a failure): an auto-served composition that does not
    //    exclude `agent-runtime` may run worktree-assuming plugins against
    //    main's checkout under a non-worktree namespace — unvalidated
    //    territory. Declaring the exclude upgrades this to the hard
    //    disjointness gate above.
    const agentRuntime = byName.get("agent-runtime");
    if (agentRuntime) {
      const agentRuntimeContainment = containmentOf(agentRuntime);
      for (const item of values.manifests) {
        if (!item.autoBuild) continue;
        if (item.excludes.includes("agent-runtime")) continue;
        const flat = flattenManifest(manifestItemToManifest(item), manifests);
        const bundle = resolveComposition(graph, flat).bundle;
        const offenders = [...bundle].filter((p) => agentRuntimeContainment.has(p)).sort();
        console.warn(
          `[composition-closure] WARNING: auto-served composition "${item.name}" does not exclude "agent-runtime"` +
            (offenders.length > 0
              ? ` and its closure includes ${offenders.length} plugin(s) from it (${offenders.slice(0, 5).join(", ")}${offenders.length > 5 ? ", …" : ""}) — these would run against main's checkout under a non-worktree namespace.`
              : ` — add \`excludes: ["agent-runtime"]\` to lock in its self-containment.`),
        );
      }
    }

    return { ok: true };
  },
};

export default check;
