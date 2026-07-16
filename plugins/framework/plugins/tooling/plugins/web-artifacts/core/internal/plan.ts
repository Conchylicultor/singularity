// Shared fleet planning — the pure "what artifacts does the CURRENT tree
// compose, at which content-addressed store names" computation, factored out of
// the build pipeline so the `web-artifacts:map-in-sync` check recomputes the
// EXACT same expected composition (targets, barrel closure, vendor requests,
// import-map entries) without ever building. The two consumers differ only in
// how a target's meta is obtained: the pipeline builds-or-reads, the check
// reads-or-bails — injected via `ensure`.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FORCED_VENDOR_SPECS, isBareSpecifier, isBrowserUnreachableDynamic } from "../constants";
import { computeInputsHash, sha256Hex } from "../hash";
import type { ImportMapEntry } from "../import-map";
import { computeBuilderIdentity, type BuilderIdentity } from "./identity";
import { ownHashFor, type ArtifactKind } from "./own-files";
import {
  artifactDirName,
  hasArtifact,
  type ArtifactMeta,
  type FingerprintCache,
} from "./store";
import type { ArtifactBuildTarget } from "./vite-builder";
import { vendorSetDirName, type VendorSetMeta, type VendorSpecRequest } from "./vendors";

export const WEB_CORE_REL = "plugins/framework/plugins/web-core";
export const WEB_SDK_CORE_REL = "plugins/framework/plugins/web-sdk/core";

export interface RegistryEntryRecord {
  pluginPath: string;
  id: string;
  dependsOn: string[];
}

export interface PlannedTarget extends ArtifactBuildTarget {
  needsBuild: boolean;
}

export interface RegistryTargetPlan {
  dirName: string;
  inputsHash: string;
  registryFile: string;
  needsBuild: boolean;
}

export interface FleetPlan {
  webEntries: RegistryEntryRecord[];
  deferredPaths: ReadonlySet<string>;
  identity: BuilderIdentity;
  webTargets: PlannedTarget[];
  entryTarget: PlannedTarget;
  registryTarget: RegistryTargetPlan;
  staleWeb: number;
}

export function pluginIdOf(pluginPath: string): string {
  return pluginPath.split("/plugins/").join(".");
}

export function artifactUrl(dirName: string): string {
  return `/artifacts/${dirName}/index.js`;
}

/**
 * Plan the base fleet (web entries + entry + registry) for the current tree:
 * pure hash computation over the plugins' own files (via the caller's
 * fingerprint cache) plus a store-existence probe per target. No builds, no
 * store writes — the caller owns cache persistence and store mutation.
 */
export async function planFleet(opts: {
  root: string;
  minify: boolean;
  cache: FingerprintCache;
}): Promise<FleetPlan> {
  const { root, cache } = opts;
  const pluginsRoot = join(root, "plugins");
  const webSrcDir = join(root, WEB_CORE_REL, "web");

  const registryFile = join(root, WEB_SDK_CORE_REL, "web.generated.ts");
  const { webEntries } = (await import(registryFile)) as { webEntries: RegistryEntryRecord[] };
  const { DEFERRED_PLUGIN_PATHS } = (await import(
    join(root, WEB_SDK_CORE_REL, "web-tiers.generated.ts")
  )) as { DEFERRED_PLUGIN_PATHS: ReadonlySet<string> };

  const identity = computeBuilderIdentity({ repoRoot: root, pluginsRoot, minify: opts.minify });

  const target = (
    kind: ArtifactKind,
    pluginPath: string | null,
    entryFile: string,
    specifier: string | null,
  ): PlannedTarget => {
    const slug = pluginPath ? pluginIdOf(pluginPath) : "web-core";
    const pluginDir = pluginPath ? join(pluginsRoot, pluginPath) : webSrcDir;
    const ownHash = ownHashFor({
      cacheKey: `${pluginPath ?? "__entry"}|${kind}`,
      pluginDir,
      kind,
      cache,
    });
    const inputsHash = computeInputsHash({ ownHash, kind, identityHash: identity.identityHash });
    const dirName = artifactDirName(slug, kind, inputsHash);
    return {
      dirName,
      kind,
      pluginPath,
      specifier,
      entryFile,
      inputsHash,
      needsBuild: !hasArtifact(dirName),
    };
  };

  const webTargets = webEntries.map((e) =>
    target("web", e.pluginPath, join(pluginsRoot, e.pluginPath, "web", "index.ts"), `@plugins/${e.pluginPath}/web`),
  );
  const entryTarget = target("entry", null, join(webSrcDir, "main.tsx"), null);

  const registrySource = readFileSync(registryFile, "utf8");
  const registryInputsHash = computeInputsHash({
    ownHash: sha256Hex(registrySource),
    kind: "registry",
    identityHash: identity.identityHash,
  });
  const registryTarget: RegistryTargetPlan = {
    dirName: artifactDirName("composition-web-registry", "registry", registryInputsHash),
    inputsHash: registryInputsHash,
    registryFile,
    needsBuild: !hasArtifact(
      artifactDirName("composition-web-registry", "registry", registryInputsHash),
    ),
  };

  return {
    webEntries,
    deferredPaths: DEFERRED_PLUGIN_PATHS,
    identity,
    webTargets,
    entryTarget,
    registryTarget,
    staleWeb: webTargets.filter((t) => t.needsBuild).length,
  };
}

/**
 * The specifiers of one emitted artifact that extend the barrel closure: every
 * static import (a miss breaks module evaluation) plus every dynamic import
 * except the kinds declared browser-unreachable
 * (`BROWSER_UNREACHABLE_DYNAMIC_KINDS`). A mapped dynamic barrel is the
 * import-map twin of the monolith's lazy chunk — the Layout Lab fixture
 * registries and the icon picker's icon map are real browser loads, and
 * leaving dynamic edges out of the closure broke both.
 */
export function closureSpecsOf(meta: ArtifactMeta): string[] {
  return [
    ...meta.staticImports,
    ...meta.dynamicImports.filter((s) => !isBrowserUnreachableDynamic(s)),
  ];
}

/**
 * Folder-barrel closure: any `@plugins/<path>/<folder>` the EMITTED modules
 * import (core barrels, fixtures, …), iterated to a fixed point (core barrels
 * import other cores). Derived from emitted imports — post-tree-shaking and
 * type-stripped, so `import type` edges never force an artifact. Edges are
 * `closureSpecsOf`: statics always, dynamics unless declared
 * browser-unreachable (prewarm registries — release-runner data the browser
 * never fetches).
 *
 * `ensure` obtains a wave target's meta: the pipeline builds-or-reads; the
 * check reads-or-returns-null, which halts expansion through that node (the
 * missing artifact is the caller's verdict).
 */
export async function resolveBarrelClosure(opts: {
  pluginsRoot: string;
  identityHash: string;
  cache: FingerprintCache;
  webSpecs: ReadonlySet<string | null>;
  seedMetas: ArtifactMeta[];
  ensure: (t: PlannedTarget) => Promise<ArtifactMeta | null>;
}): Promise<Map<string, PlannedTarget>> {
  const barrelTargets = new Map<string, PlannedTarget>(); // spec → target
  let frontier = [...opts.seedMetas];
  while (frontier.length > 0) {
    const nextSpecs = new Set<string>();
    for (const meta of frontier) {
      for (const spec of closureSpecsOf(meta)) {
        if (!spec.startsWith("@plugins/") || barrelTargets.has(spec) || opts.webSpecs.has(spec)) {
          continue;
        }
        nextSpecs.add(spec);
      }
    }
    const wave: PlannedTarget[] = [];
    for (const spec of [...nextSpecs].sort()) {
      const rel = spec.slice("@plugins/".length);
      const slash = rel.lastIndexOf("/");
      const pluginPath = rel.slice(0, slash);
      const kind = rel.slice(slash + 1);
      const pluginDir = join(opts.pluginsRoot, pluginPath);
      const barrelFile = join(pluginDir, kind, "index.ts");
      if (slash <= 0 || !existsSync(barrelFile)) {
        throw new Error(
          `artifact closure: emitted static import "${spec}" is not a folder barrel ` +
            `(expected ${barrelFile}) — cannot compose it into the import map.`,
        );
      }
      const ownHash = ownHashFor({
        cacheKey: `${pluginPath}|${kind}`,
        pluginDir,
        kind,
        cache: opts.cache,
      });
      const inputsHash = computeInputsHash({
        ownHash,
        kind,
        identityHash: opts.identityHash,
      });
      const t: PlannedTarget = {
        dirName: artifactDirName(pluginIdOf(pluginPath), kind, inputsHash),
        kind,
        pluginPath,
        specifier: spec,
        entryFile: barrelFile,
        inputsHash,
        needsBuild: !hasArtifact(artifactDirName(pluginIdOf(pluginPath), kind, inputsHash)),
      };
      barrelTargets.set(spec, t);
      wave.push(t);
    }
    const waveMetas = await Promise.all(wave.map(opts.ensure));
    frontier = waveMetas.filter((m): m is ArtifactMeta => m !== null);
  }
  return barrelTargets;
}

/**
 * The vendor-set input: every bare npm specifier the emitted artifacts import
 * (static + dynamic), each paired with a resolveDir that can resolve it (the
 * lexicographically-first importing artifact's plugin dir, so plugin-local deps
 * resolve under bun's isolated installs), plus the forced always-vendored specs.
 */
export async function collectVendorRequests(opts: {
  root: string;
  pluginsRoot: string;
  /** web + core-closure + entry targets (NOT the registry). */
  targets: PlannedTarget[];
  metaOf: (dirName: string) => ArtifactMeta;
}): Promise<VendorSpecRequest[]> {
  const requests = new Map<string, string>();
  for (const t of [...opts.targets].sort((a, b) => (a.dirName < b.dirName ? -1 : 1))) {
    const meta = opts.metaOf(t.dirName);
    const dir = t.pluginPath ? join(opts.pluginsRoot, t.pluginPath) : join(opts.root, WEB_CORE_REL);
    for (const spec of [...meta.staticImports, ...meta.dynamicImports]) {
      if (isBareSpecifier(spec) && !requests.has(spec)) requests.set(spec, dir);
    }
  }
  for (const spec of FORCED_VENDOR_SPECS) {
    if (!requests.has(spec)) {
      // `scheduler` is transitive (react-dom's dep): resolvable from the
      // react-dom package dir, not the repo root, under isolated installs.
      if (spec === "scheduler") {
        const { createRequire } = await import("node:module");
        const req = createRequire(join(opts.root, "package.json"));
        requests.set(spec, join(req.resolve("react-dom/package.json"), ".."));
      } else {
        requests.set(spec, opts.root);
      }
    }
  }
  return [...requests.entries()].map(([specifier, resolveDir]) => ({ specifier, resolveDir }));
}

/**
 * The import-map entry set of a composed fleet: one entry per target specifier
 * (the entry artifact has none), the registry alias, and one entry per vendor
 * specifier. Shared by the compose step and the map-in-sync check so the
 * expected and deployed maps cannot drift by construction.
 */
export function composeMapEntries(opts: {
  /** web + core-closure + entry targets. */
  targets: PlannedTarget[];
  registryDirName: string;
  vendorMeta: VendorSetMeta;
}): ImportMapEntry[] {
  const entries: ImportMapEntry[] = [];
  for (const t of opts.targets) {
    if (t.specifier !== null) entries.push({ specifier: t.specifier, url: artifactUrl(t.dirName) });
  }
  entries.push({
    specifier: "@composition-web-registry",
    url: artifactUrl(opts.registryDirName),
  });
  const vendorLink = vendorSetDirName(opts.vendorMeta.setHash);
  for (const [spec, file] of Object.entries(opts.vendorMeta.entries)) {
    entries.push({ specifier: spec, url: `/artifacts/${vendorLink}/${file}` });
  }
  return entries;
}
