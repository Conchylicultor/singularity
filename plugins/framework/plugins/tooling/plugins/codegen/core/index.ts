export {
  buildEnrichedTree,
  buildBarrelFreeTree,
  collectAllPlugins,
  generatePluginDocs,
  pluginClaudeMdPath,
  pluginCompactDocPath,
  pluginDetailsDocPath,
  renderCompactDoc,
  renderDetailsDoc,
  renderPluginClaudeMd,
  type GenerateDocsOptions,
} from "./docgen";

export {
  collectedDirRegistryPath,
  collectedDirCompositionRegistryPath,
  clearCompositionRegistries,
  discoverCollectedDirs,
  generateCompositionRegistry,
  generatePluginRegistry,
  renderCollectedDirRegistry,
  buildRegistryGenContext,
  standardPluginDirs,
  type DiscoveredCollectedDir,
  type RegistryGenContext,
} from "./plugin-registry-gen";

// defineCollectedDir / CollectedDirDef / isCollectedDirDef now live in the
// dependency-free leaf @plugins/framework/plugins/tooling/plugins/collected-dir/core
// (the runtimes import the marker from there without forming a cycle through
// plugin-tree/facets, which codegen depends on).

export {
  generateConfigOrigins,
  propagateConfigToUser,
  renderConfigOriginContent,
  loadConfigDescriptorsByOriginPath,
  resolveOriginAnnotations,
  setDefaultOriginAnnotations,
  setDefaultOriginAnnotationsPreparer,
  resolveOriginDefaults,
  setDefaultOriginDefaults,
  setDefaultOriginDefaultsPreparer,
  type OriginAnnotationsProvider,
  type OriginAnnotationsPreparer,
  type OriginDefaultsProvider,
  type OriginDefaultsPreparer,
} from "./config-origin-gen";

// Importing this module registers the reorder contribution catalog as the
// default origin-annotations preparer (side effect at load). Both the build
// step and the `config-origins-in-sync` check import this barrel, so both
// processes emit identical contribution-catalog comments in generated origins.
export {
  generateReorderableSlots,
  renderReorderableSlotsManifest,
  reorderableSlotsManifestPath,
  type ReorderableSlotEntry,
} from "./reorderable-slots-gen";

export {
  collectDataViews,
  generateDataViews,
  renderDataViewsManifest,
  dataViewsManifestPath,
} from "./data-views-gen";

export {
  collectFieldEagerBarrels,
  generateFieldsEager,
  renderFieldsEagerManifest,
  fieldsEagerManifestPath,
} from "./fields-eager-gen";

// The closed disabled-plugin id set (seeds + dependent-closure cascade), shared
// by the codegen generators and the in-sync checks so both derive identical
// filtered/annotated output from the committed `package.json` flags.
export { computeDisabledIds } from "./disabled-ids";

export {
  generateBarrelStubs,
  renderBarrelStubs,
  barrelStubsPath,
} from "./barrel-stubs-gen";

export {
  collectTokenGroupVars,
  generateTokenGroupVars,
  renderTokenGroupVarsManifest,
  tokenGroupVarsManifestPath,
} from "./token-group-vars-gen";

export {
  generateCustomUtilities,
  renderCustomUtilities,
  customUtilitiesManifestPath,
  parseCustomUtilities,
} from "./custom-utilities-gen";

// Single source of truth for the ordered, non-migration repo-tree codegen
// pipeline shared by `./singularity build` and the push-time `regen-generated`
// normalize step, so the two can never drift apart.
export {
  regenerateRegistryCodegen,
  regenerateManifestCodegen,
  type CodegenStep,
  type RegenCodegenOptions,
} from "./regen-pipeline";

// The pre-barrel manifest set — the single source of truth for which
// `*.generated.ts` files MUST be regenerated before the first barrel import.
// Read by both the runtime freeze-point guard and the static completeness check.
export {
  preBarrelManifests,
  writePreBarrelManifest,
  type PreBarrelManifest,
} from "./pre-barrel-manifests";

// Static module-import-graph helpers used by the `pre-barrel-manifests-complete`
// check to prove no barrel reaches an unregistered `*.generated.ts` at load.
export {
  extractRuntimeImportSpecifiers,
  resolveImportSpecifier,
} from "./import-graph";
