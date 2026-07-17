export {
  barrelKindOf,
  BROWSER_UNREACHABLE_DYNAMIC_KINDS,
  BUILDER_VERSION,
  FORCED_VENDOR_SPECS,
  INLINE_PACKAGES,
  isBareSpecifier,
  isBrowserUnreachableDynamic,
  isInlinedPackage,
  packageNameOf,
} from "./constants";
export { makeArtifactExternal } from "./externals";
export { computeIdentityHash, computeInputsHash, computeOwnHash, sha256Hex } from "./hash";
export type { OwnFile } from "./hash";
export { buildImportMap, findUnmappedDynamicWarnings, findUnmappedSpecifiers } from "./import-map";
export type { ImportMapEntry } from "./import-map";
export { computePreloadClosure } from "./internal/compose";
export { readFleetVendorMeta } from "./internal/expected";
export { runWebArtifactsPipeline } from "./internal/pipeline";
export type {
  WebArtifactsPipelineOptions,
  WebArtifactsPipelineResult,
} from "./internal/pipeline";
export { compositionFleetSource, defaultFleetSource } from "./internal/plan";
export type { FleetSource } from "./internal/plan";
export type { VendorSetMeta } from "./internal/vendors";
