import { existsSync, readFileSync } from "fs";
import { join, relative, resolve } from "path";
import {
  barrelStubsPath,
  collectedDirCompositionRegistryPath,
  collectedDirRegistryPath,
  discoverCollectedDirs,
  extractRuntimeImportSpecifiers,
  preBarrelManifests,
  resolveImportSpecifier,
} from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

const RUNTIMES = ["web", "server", "central"] as const;

/**
 * The set of `*.generated.ts` files a barrel is ALLOWED to reach at module-load:
 *   - every pre-barrel manifest (regenerated before the first barrel import), and
 *   - the registry-phase outputs (collected-dir registries + composition
 *     registries + the auto-stubs file) — these are written in the EARLIER
 *     `regenerateRegistryCodegen` phase, so they're always fresh by the time any
 *     barrel import happens in the manifest phase.
 */
function buildAllowSet(root: string): Set<string> {
  const allow = new Set<string>();
  for (const m of preBarrelManifests) allow.add(resolve(m.path(root)));
  allow.add(resolve(barrelStubsPath(root)));
  for (const def of discoverCollectedDirs(root)) {
    allow.add(resolve(collectedDirRegistryPath(def)));
    allow.add(resolve(collectedDirCompositionRegistryPath(def)));
  }
  return allow;
}

/** Every barrel file that the build imports (web/server/central + the seed). */
async function enumerateBarrels(root: string): Promise<string[]> {
  const pluginsRoot = join(root, "plugins");
  const tree = await buildPluginTree(pluginsRoot, { skipBarrelImport: true });
  const barrels: string[] = [];

  // The web-sdk core seed barrel imported by buildPluginTree's Step 4a.
  const seed = join(pluginsRoot, "framework/plugins/web-sdk/core/index.ts");
  if (existsSync(seed)) barrels.push(seed);

  for (const node of tree.byDir.values()) {
    for (const runtime of RUNTIMES) {
      const barrel = join(node.dir, runtime, "index.ts");
      if (existsSync(barrel)) barrels.push(barrel);
    }
  }
  return barrels;
}

/**
 * DFS from each barrel over its internal runtime imports (relative paths and
 * same-repo `@plugins/…` aliases), collecting every reachable file that ends in
 * `.generated.ts`. The visited set is shared across all barrels, so each file is
 * read at most once. Returns absolute, normalized paths.
 */
function collectReachableGenerated(root: string, barrels: string[]): Set<string> {
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
    "every *.generated.ts reachable from a plugin barrel at module-load is a registered pre-barrel manifest (or a registry-phase output)",
  async run() {
    const root = await getRoot();
    const allow = buildAllowSet(root);
    const barrels = await enumerateBarrels(root);
    const reachable = collectReachableGenerated(root, barrels);

    const offenders = [...reachable]
      .filter((f) => !allow.has(f))
      .map((f) => relative(root, f))
      .sort();

    if (offenders.length === 0) return { ok: true };

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
  },
};

export default check;
