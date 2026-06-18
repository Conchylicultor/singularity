import { generateBarrelStubs } from "./barrel-stubs-gen";
import { generateConfigOrigins } from "./config-origin-gen";
import { generateDataViews } from "./data-views-gen";
import { generatePluginDocs } from "./docgen";
import { generatePluginRegistry } from "./plugin-registry-gen";
import { generateReorderableSlots } from "./reorderable-slots-gen";
import { generateTokenGroupVars } from "./token-group-vars-gen";

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
 * Manifest-level repo-tree codegen: plugin docs → reorderable-slots →
 * data-views → token-group-vars → config-origins.
 *
 * Ordering constraints (load-bearing — do not reorder):
 *   - plugin docs FIRST: builds the enriched plugin tree the next two steps reuse.
 *   - reorderable-slots & data-views: AFTER plugin docs (reuse the enriched tree),
 *     BEFORE config origins — each registers config_v2 directives (one per slot /
 *     one `views` descriptor per id) that the origins depend on. Importing the
 *     codegen barrel also installs the reorder per-slot contribution catalog as
 *     the default origin-annotations preparer, so origins carry the catalog
 *     comments.
 *   - token-group-vars: BEFORE the build-time CSS single-owner checks
 *     (`css-vars-single-owner`, `css-vars-supplied`) consume it; safe here since
 *     it only reads token-group descriptors.
 *   - config-origins: LAST — depends on every config_v2 directive registered above.
 */
export async function regenerateManifestCodegen({
  root,
  onStep = runInline,
}: RegenCodegenOptions): Promise<void> {
  await onStep("pluginDocs", "generate plugin docs", () =>
    generatePluginDocs({ root }),
  );
  await onStep("reorderableSlots", "reorderable slots manifest", () =>
    generateReorderableSlots({ root }),
  );
  await onStep("dataViews", "data-views manifest", () =>
    generateDataViews({ root }),
  );
  await onStep("tokenGroupVars", "token-group vars manifest", () =>
    generateTokenGroupVars({ root }),
  );
  await onStep("configOrigins", "generate config origins", () =>
    generateConfigOrigins({ root }),
  );
}
