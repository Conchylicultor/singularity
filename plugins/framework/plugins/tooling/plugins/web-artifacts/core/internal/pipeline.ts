// Pipeline orchestration: detect → build (webs + entry + registry + core
// closure) → vendors → global css → compose. Stage boundaries are exposed via
// `onStage` so the caller (the build CLI) owns profiler spans. Target planning,
// the barrel closure, vendor-request assembly, and map-entry assembly live in
// `plan.ts`, shared with the `web-artifacts:map-in-sync` check.

import os from "node:os";
import { basename, join } from "node:path";
import { createSemaphore } from "@plugins/packages/plugins/semaphore/core";
import { loadBabelContributions } from "@plugins/framework/plugins/web-core/core";
import { BUILDER_VERSION } from "../constants";
import { findUnmappedDynamicWarnings, type ImportMapEntry } from "../import-map";
import {
  artifactUrl,
  collectVendorRequests,
  composeMapEntries,
  planFleet,
  resolveBarrelClosure,
  WEB_CORE_REL,
  type PlannedTarget,
} from "./plan";
import {
  artifactStorePath,
  ensureStoreDirs,
  loadFingerprintCache,
  pruneStore,
  readArtifactMeta,
  saveFingerprintCache,
  touchArtifact,
  type ArtifactMeta,
} from "./store";
import { buildArtifact, buildRegistryArtifact, type BuilderCtx } from "./vite-builder";
import { ensureVendorSet, pruneVendorSets, vendorSetDirName, vendorSetPath } from "./vendors";
import {
  computeGlobalCssKey,
  ensureGlobalCss,
  hasGlobalCssCache,
  pruneGlobalCssCache,
} from "./global-css";
import { composeDist } from "./compose";

export interface WebArtifactsPipelineOptions {
  root: string;
  /** The build's staging dist dir (published atomically by the caller). */
  stagingDir: string;
  minify: boolean;
  buildId: string;
  log: (line: string) => void;
  /** Stage wrapper — the caller records profiler spans here. */
  onStage: <T>(id: string, label: string, run: () => Promise<T>) => Promise<T>;
}

export interface WebArtifactsPipelineResult {
  webArtifacts: number;
  coreArtifacts: number;
  builtArtifacts: number;
  reusedArtifacts: number;
  vendorSpecs: number;
  preloads: number;
}

export async function runWebArtifactsPipeline(
  opts: WebArtifactsPipelineOptions,
): Promise<WebArtifactsPipelineResult> {
  const { root, log } = opts;
  const pluginsRoot = join(root, "plugins");
  const webSrcDir = join(root, WEB_CORE_REL, "web");
  const worktreeName = basename(root);

  // ── Stage 1: detect ─────────────────────────────────────────────────
  const cache = loadFingerprintCache(worktreeName);
  const plan = await opts.onStage("artifacts:detect", "detect changed artifacts", async () => {
    ensureStoreDirs();
    pruneStore();
    pruneVendorSets();
    pruneGlobalCssCache();

    const fleet = await planFleet({ root, minify: opts.minify, cache });
    saveFingerprintCache(worktreeName, cache);
    log(
      `detect: ${fleet.webTargets.length} web artifacts (${fleet.staleWeb} stale), entry ${fleet.entryTarget.needsBuild ? "stale" : "cached"}, registry ${fleet.registryTarget.needsBuild ? "stale" : "cached"}`,
    );
    return fleet;
  });

  // ── Stage 2: build (webs + entry + registry, then the core closure) ─
  const buildOut = await opts.onStage(
    "artifacts:build",
    `build artifacts (${plan.staleWeb + (plan.entryTarget.needsBuild ? 1 : 0)} stale)`,
    async () => {
      const ctx: BuilderCtx = {
        repoRoot: root,
        pluginsRoot,
        babelPlugins: await loadBabelContributions({ pluginsRoot, repoRoot: root }),
        minify: opts.minify,
      };
      const gate = createSemaphore(
        Math.min(8, Math.max(2, Math.floor(os.cpus().length / 2))),
      );
      const metas = new Map<string, ArtifactMeta>(); // dirName → meta
      let built = 0;
      let reused = 0;

      const ensure = async (t: PlannedTarget): Promise<ArtifactMeta> => {
        if (t.needsBuild) {
          const meta = await gate.run(() => buildArtifact(t, ctx));
          metas.set(t.dirName, meta);
          built++;
          return meta;
        }
        touchArtifact(t.dirName);
        const meta = readArtifactMeta(t.dirName);
        metas.set(t.dirName, meta);
        reused++;
        return meta;
      };

      const registryPromise = (async () => {
        if (plan.registryTarget.needsBuild) {
          const meta = await buildRegistryArtifact({
            dirName: plan.registryTarget.dirName,
            inputsHash: plan.registryTarget.inputsHash,
            registryFile: plan.registryTarget.registryFile,
            minify: opts.minify,
          });
          metas.set(plan.registryTarget.dirName, meta);
          built++;
        } else {
          touchArtifact(plan.registryTarget.dirName);
          metas.set(plan.registryTarget.dirName, readArtifactMeta(plan.registryTarget.dirName));
          reused++;
        }
      })();

      await Promise.all([
        ...plan.webTargets.map(ensure),
        ensure(plan.entryTarget),
        registryPromise,
      ]);

      const barrelTargets = await resolveBarrelClosure({
        pluginsRoot,
        identityHash: plan.identity.identityHash,
        cache,
        webSpecs: new Set(plan.webTargets.map((t) => t.specifier)),
        seedMetas: [...metas.values()],
        ensure,
      });
      saveFingerprintCache(worktreeName, cache);

      log(`build: ${built} built, ${reused} reused (${barrelTargets.size} barrel artifacts)`);
      return { metas, coreTargets: [...barrelTargets.values()], built, reused };
    },
  );

  // ── Stage 3: vendors ────────────────────────────────────────────────
  const allTargets: PlannedTarget[] = [
    ...plan.webTargets,
    ...buildOut.coreTargets,
    plan.entryTarget,
  ];

  const vendors = await opts.onStage("artifacts:vendors", "vendor pre-bundles", async () => {
    const requests = await collectVendorRequests({
      root,
      pluginsRoot,
      targets: allTargets,
      metaOf: (dirName) => buildOut.metas.get(dirName)!,
    });
    const meta = await ensureVendorSet({
      requests,
      minify: opts.minify,
      builderVersion: BUILDER_VERSION,
    });
    log(`vendors: ${requests.length} specifiers (set ${meta.setHash.slice(0, 12)})`);
    return meta;
  });

  // ── Stage 4: global css ─────────────────────────────────────────────
  const cssKey = await opts.onStage("artifacts:css-key", "global css input fingerprint", async () => {
    const key = computeGlobalCssKey({ repoRoot: root, pluginsRoot, minify: opts.minify, cache });
    saveFingerprintCache(worktreeName, cache);
    return key;
  });
  const cssCached = hasGlobalCssCache(cssKey);
  const css = await opts.onStage(
    "artifacts:css",
    cssCached ? "global css (cached)" : "global tailwind pass",
    () =>
      ensureGlobalCss({
        repoRoot: root,
        pluginsRoot,
        stagingDir: opts.stagingDir,
        minify: opts.minify,
        key: cssKey,
      }),
  );
  log(`css: ${css.cached ? "cache hit" : "tailwind pass"} (key ${cssKey.slice(0, 12)})`);

  // ── Stage 5: compose ────────────────────────────────────────────────
  const composed = await opts.onStage("artifacts:compose", "compose dist", async () => {
    const links: Array<{ linkName: string; storePath: string }> = [];
    const staticImportsByUrl: Record<string, string[]> = {};
    const emitted: Array<{ importer: string; specifiers: string[] }> = [];

    // Coverage is STRICT for static imports (a miss breaks module evaluation)
    // and for the registry's dynamic imports (its loaders are the app). Other
    // artifacts' dynamic imports are mapped by construction too — the barrel
    // closure follows them — EXCEPT the kinds declared browser-unreachable
    // (BROWSER_UNREACHABLE_DYNAMIC_KINDS), which are silent by declaration.
    // Anything else unmapped here is a pipeline bug and warns loudly.
    const dynamicOnly: Array<{ importer: string; specifiers: string[] }> = [];
    const registerArtifact = (dirName: string, strictDynamic: boolean): void => {
      links.push({ linkName: dirName, storePath: artifactStorePath(dirName) });
      const meta = buildOut.metas.get(dirName)!;
      const url = artifactUrl(dirName);
      staticImportsByUrl[url] = meta.staticImports;
      emitted.push({
        importer: dirName,
        specifiers: strictDynamic
          ? [...meta.staticImports, ...meta.dynamicImports]
          : meta.staticImports,
      });
      if (!strictDynamic && meta.dynamicImports.length > 0) {
        dynamicOnly.push({ importer: dirName, specifiers: meta.dynamicImports });
      }
    };

    for (const t of allTargets) registerArtifact(t.dirName, false);
    registerArtifact(plan.registryTarget.dirName, true);

    // Map entries: one per target specifier + the registry alias + one per
    // vendor specifier — assembled by the same helper the map-in-sync check
    // recomputes with, so the two cannot drift.
    const mapEntries: ImportMapEntry[] = composeMapEntries({
      targets: allTargets,
      registryDirName: plan.registryTarget.dirName,
      vendorMeta: vendors,
    });

    // Vendor set: one symlink; per-file imports feed the preload closure.
    const vendorLink = vendorSetDirName(vendors.setHash);
    links.push({ linkName: vendorLink, storePath: vendorSetPath(vendors.setHash) });
    for (const [file, imports] of Object.entries(vendors.imports)) {
      staticImportsByUrl[`/artifacts/${vendorLink}/${file}`] = imports;
    }

    const entryUrl = artifactUrl(plan.entryTarget.dirName);
    const eagerSeeds = plan.webTargets
      .filter((t) => t.pluginPath !== null && !plan.deferredPaths.has(t.pluginPath))
      .map((t) => artifactUrl(t.dirName));
    const preloadSeeds = [entryUrl, artifactUrl(plan.registryTarget.dirName), ...eagerSeeds];

    const { importMap, preloads } = composeDist({
      stagingDir: opts.stagingDir,
      webSrcDir,
      buildId: opts.buildId,
      minify: opts.minify,
      cssHref: css.href,
      links,
      mapEntries,
      staticImportsByUrl,
      emitted,
      entryUrl,
      preloadSeeds,
    });
    const unmappedDynamic = findUnmappedDynamicWarnings(dynamicOnly, importMap);
    for (const u of unmappedDynamic) {
      log(
        `warning: dynamic import "${u.specifier}" (from ${u.importer}) has no import-map entry — ` +
          `it will fail if ever invoked in the browser`,
      );
    }
    log(`compose: ${links.length} links, ${mapEntries.length} map entries, ${preloads.length} preloads`);
    return { preloads };
  });

  return {
    webArtifacts: plan.webTargets.length,
    coreArtifacts: buildOut.coreTargets.length,
    builtArtifacts: buildOut.built,
    reusedArtifacts: buildOut.reused,
    vendorSpecs: Object.keys(vendors.entries).length,
    preloads: composed.preloads.length,
  };
}
