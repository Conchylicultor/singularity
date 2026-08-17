import { existsSync, readFileSync } from "fs";
import { join, relative, resolve } from "path";
import {
  barrelStubsPath,
  collectedDirRegistryPath,
  discoverCollectedDirs,
  extractRuntimeImportSpecifiers,
  postWebManifests,
  preBarrelManifests,
  resolveImportSpecifier,
} from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

const RUNTIMES = ["web", "server", "central"] as const;

/**
 * The set of `*.generated.ts` files a barrel is ALLOWED to reach at module-load:
 *   - every pre-barrel manifest (regenerated before the first barrel import),
 *   - every post-web manifest (written between the web and server import
 *     phases — allowed to a SERVER/central barrel only, see below), and
 *   - the registry-phase outputs (collected-dir registries + the auto-stubs
 *     file) — these are written in the EARLIER `regenerateRegistryCodegen`
 *     phase, so they're always fresh by the time any barrel import happens in
 *     the manifest phase.
 *
 * Composition-filtered registries need no entry: they are reached only through
 * the `@composition-{web,server}-registry` bundler alias or a variable dynamic
 * specifier, neither of which this check's static DFS follows.
 */
function buildAllowSet(root: string): Set<string> {
  const allow = new Set<string>();
  for (const m of preBarrelManifests) allow.add(resolve(m.path(root)));
  for (const m of postWebManifests) allow.add(resolve(m.path(root)));
  allow.add(resolve(barrelStubsPath(root)));
  for (const def of discoverCollectedDirs(root)) {
    allow.add(resolve(collectedDirRegistryPath(def)));
  }
  return allow;
}

/**
 * Every barrel file that the build imports, split by the phase that imports it.
 *
 * The split is what makes the post-web rule checkable: a post-web manifest is
 * written AFTER the web barrels are imported, so a web barrel reaching one would
 * freeze the previous run's copy — the exact failure the pre-barrel set exists
 * to prevent, one phase later. The web-sdk core seed is imported in the web
 * phase (buildPluginTree's Step 4a), so it counts as web.
 */
async function enumerateBarrels(
  root: string,
): Promise<{ web: string[]; rest: string[] }> {
  const pluginsRoot = join(root, "plugins");
  const tree = await buildPluginTree(pluginsRoot, { skipBarrelImport: true });
  const web: string[] = [];
  const rest: string[] = [];

  const seed = join(pluginsRoot, "framework/plugins/web-sdk/core/index.ts");
  if (existsSync(seed)) web.push(seed);

  for (const node of tree.byDir.values()) {
    for (const runtime of RUNTIMES) {
      const barrel = join(node.dir, runtime, "index.ts");
      if (!existsSync(barrel)) continue;
      (runtime === "web" ? web : rest).push(barrel);
    }
  }
  return { web, rest };
}

/**
 * DFS from each barrel over its internal runtime imports (relative paths and
 * same-repo `@plugins/…` aliases), collecting every reachable file that ends in
 * `.generated.ts`. The visited set is shared across all barrels, so each file is
 * read at most once. Returns absolute, normalized paths.
 */
function collectReachableGenerated(
  root: string,
  barrels: string[],
): Set<string> {
  const visited = new Set<string>();
  const generated = new Set<string>();

  const visit = (file: string): void => {
    const abs = resolve(file);
    if (visited.has(abs)) return;
    visited.add(abs);
    if (abs.endsWith(".generated.ts")) generated.add(abs);

    const src = readFileSync(abs, "utf8");
    // `extractRuntimeImportSpecifiers` masks internally (via `findImports`) and
    // reads specifiers by offset, so it takes RAW source.
    for (const spec of extractRuntimeImportSpecifiers(src)) {
      const resolved = resolveImportSpecifier(root, abs, spec);
      if (resolved) visit(resolved);
    }
  };

  for (const barrel of barrels) {
    if (existsSync(barrel)) visit(barrel);
  }
  return generated;
}

const check: Check = {
  id: "pre-barrel-manifests-complete",
  description:
    "every *.generated.ts reachable from a plugin barrel at module-load is a registered pre-barrel manifest (or a registry-phase output), and no web barrel reaches a post-web manifest",
  async run() {
    const root = await getWorktreeRoot();
    const allow = buildAllowSet(root);
    const { web, rest } = await enumerateBarrels(root);
    const fromWeb = collectReachableGenerated(root, web);
    const reachable = collectReachableGenerated(root, [...web, ...rest]);

    const offenders = [...reachable]
      .filter((f) => !allow.has(f))
      .map((f) => relative(root, f))
      .sort();

    if (offenders.length > 0) {
      return {
        ok: false,
        message:
          `These generated files are imported by a plugin barrel at module-load ` +
          `but are NOT registered as pre-barrel manifests:\n` +
          offenders.map((p) => `  - ${p}`).join("\n"),
        hint:
          "Register it in preBarrelManifests (codegen/core/pre-barrel-manifests.ts) " +
          "so it's regenerated before the first barrel import, or stop importing it " +
          "from a barrel. Bun freezes a module on first import(), so a barrel-reachable " +
          "manifest that is generated after the first barrel import can never refresh.",
      };
    }

    // The post-web half: these are written AFTER the web barrels are imported,
    // so a web barrel reaching one freezes the previous run's copy.
    const postWebPaths = new Set(
      postWebManifests.map((m) => resolve(m.path(root))),
    );
    const webOffenders = [...fromWeb]
      .filter((f) => postWebPaths.has(f))
      .map((f) => relative(root, f))
      .sort();

    if (webOffenders.length === 0) return { ok: true };

    return {
      ok: false,
      message:
        `These POST-WEB manifests are imported by a WEB barrel at module-load:\n` +
        webOffenders.map((p) => `  - ${p}`).join("\n"),
      hint:
        "A post-web manifest (postWebManifests in codegen/core/pre-barrel-manifests.ts) " +
        "is written between the web and server import phases, so the web barrel that " +
        "imports it has already frozen the previous run's copy. Derive the value on " +
        "the web runtime instead (reorder reads it off the slot objects), or move the " +
        "manifest back into preBarrelManifests with a barrel-free renderer.",
    };
  },
};

export default check;
