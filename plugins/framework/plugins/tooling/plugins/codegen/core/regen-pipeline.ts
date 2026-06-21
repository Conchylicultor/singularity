import { setPreBarrelImportGuard } from "@plugins/plugin-meta/plugins/barrel-import/core";
import { generateBarrelStubs } from "./barrel-stubs-gen";
import { generateConfigOrigins } from "./config-origin-gen";
import { generatePluginDocs } from "./docgen";
import { generatePluginRegistry } from "./plugin-registry-gen";
import { generateTokenGroupVars } from "./token-group-vars-gen";
import {
  preBarrelManifests,
  writePreBarrelManifest,
} from "./pre-barrel-manifests";
import { assertPreBarrelManifestsFresh } from "./pre-barrel-guard";

/**
 * Single source of truth for the ordered, non-migration **repo-tree** codegen
 * pipeline.
 *
 * The full `./singularity build` and the push-time `regen-generated` normalize
 * step MUST regenerate the identical set of repo-tree artifacts, in the identical
 * order — otherwise push can commit a tree the next full build doesn't reproduce
 * (dirtying main) and push-time in-sync checks miss drift. This module is that
 * shared pipeline so the two paths can never drift again. (Duplicating the call
 * list across build.ts and regen-generated.ts is exactly how the drift was
 * introduced.)
 *
 * Out of scope (NOT repo-tree codegen, handled by their own steps in build):
 *   - DB migrations (`generateMigration`) — stateful, build-only.
 *   - `writeCentralRoutesManifest`, `central.json`, `propagateConfigToUser` —
 *     these write under `~/.singularity/`, not the repo tree.
 *
 * Split into two functions to preserve build's interleaving of DB/central steps:
 * build runs registry codegen early (before central spawns + migrations), then
 * the manifest codegen later (after migrations). `regen-generated` runs both
 * back-to-back. The order WITHIN each function is authoritative — keep the
 * ordering comments here as the record of why.
 */

/**
 * A per-step wrapper used by build to attach a profiler span to each generator
 * call. The default (used by `regen-generated`) just runs the step inline. `id`
 * and `label` mirror the build profiler's span identifiers so build keeps its
 * per-step granularity.
 */
export type CodegenStep = (
  id: string,
  label: string,
  run: () => Promise<void>,
) => Promise<void>;

const runInline: CodegenStep = (_id, _label, run) => run();

export interface RegenCodegenOptions {
  root: string;
  /** Optional per-step wrapper (build threads its profiler through this). */
  onStep?: CodegenStep;
}

/**
 * Registry-level repo-tree codegen: barrel stubs + plugin registry.
 *
 * Runs FIRST in build — before central is spawned (its `plugins.generated.ts`
 * must be in sync) and before migrations. Barrel stubs must precede the registry
 * because registry generation imports barrels under the stub set.
 */
export async function regenerateRegistryCodegen({
  root,
  onStep = runInline,
}: RegenCodegenOptions): Promise<void> {
  await onStep("barrelStubs", "barrel stubs", () => generateBarrelStubs({ root }));
  await onStep("pluginRegistry", "plugin registry", () =>
    generatePluginRegistry({ root }),
  );
}

/**
 * Manifest-level repo-tree codegen: pre-barrel manifests → plugin docs →
 * token-group-vars → config-origins.
 *
 * Ordering constraints (load-bearing — do not reorder):
 *   - PRE-BARREL manifests FIRST — the set is now defined by `preBarrelManifests`
 *     (codegen/core/pre-barrel-manifests.ts), not hand-listed here. These are
 *     generated source files that plugin barrels import at module-load (directly
 *     or transitively). Bun's ESM cache freezes a module on the first `import()`
 *     and a later disk write cannot invalidate it — so every one MUST be
 *     regenerated (via barrel-free renderers) BEFORE `generatePluginDocs`
 *     triggers the first barrel import. Otherwise `generateConfigOrigins`
 *     re-imports stale barrels, misses the new descriptor, and
 *     `pruneOrphanedConfigFiles` deletes the freshly-authored override. This is
 *     enforced structurally now, not just by ordering: the runtime guard
 *     (`assertPreBarrelManifestsFresh`, installed below as the one-shot
 *     pre-barrel-import guard) throws if any manifest is stale at the first
 *     barrel import, and the `pre-barrel-manifests-complete` static check proves
 *     no barrel reaches an unregistered `*.generated.ts` at load.
 *
 *     NB: customUtilities lives in the pre-barrel set because it IS
 *     barrel-reachable at module-load — the ui-kit web barrel's `cn` export pulls
 *     `lib/utils.ts`, which iterates `CUSTOM_UTILITY_REGISTRY` (from
 *     `custom-utilities.generated.ts`) at top level. Its renderer only reads
 *     app.css by path (no plugin tree), so generating it pre-barrel is sound; it
 *     was previously generated AFTER plugin docs, which was a latent freeze bug.
 *   - plugin docs: AFTER the pre-barrel manifests — it builds the enriched plugin
 *     tree (importing every barrel), which token-group-vars / config-origins
 *     reuse. Importing the codegen barrel also installs the reorder per-slot
 *     contribution catalog as the default origin-annotations preparer, so origins
 *     carry the catalog comments.
 *   - token-group-vars: BEFORE the build-time CSS single-owner checks
 *     (`css-vars-single-owner`, `css-vars-supplied`) consume it; safe here since
 *     it only reads token-group descriptors.
 *   - config-origins: LAST — depends on every config_v2 directive registered above.
 */
export async function regenerateManifestCodegen({
  root,
  onStep = runInline,
}: RegenCodegenOptions): Promise<void> {
  // Pre-barrel phase: regenerate every barrel-reachable manifest before any
  // barrel import freezes the ESM cache. Set defined by `preBarrelManifests`.
  for (const m of preBarrelManifests) {
    await onStep(m.id, `${m.id} manifest`, () =>
      writePreBarrelManifest(m, root),
    );
  }

  // Arm the freeze-point guard: the first barrel import (inside generatePluginDocs)
  // now asserts every pre-barrel manifest is still fresh, turning the ordering
  // invariant into a loud runtime failure instead of silent config pruning.
  setPreBarrelImportGuard(() => assertPreBarrelManifestsFresh(root));
  try {
    await onStep("pluginDocs", "generate plugin docs", () =>
      generatePluginDocs({ root }),
    );
    await onStep("tokenGroupVars", "token-group vars manifest", () =>
      generateTokenGroupVars({ root }),
    );
    await onStep("configOrigins", "generate config origins", () =>
      generateConfigOrigins({ root }),
    );
  } finally {
    // Disarm so a guard never leaks into a later run / unrelated barrel import.
    setPreBarrelImportGuard(() => {});
  }
}
