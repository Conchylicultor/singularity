export { defineConfig } from "./internal/define-config";
export type {
  Disposable,
  JsonValue,
  ConfigDescriptor,
  ConfigSource,
  ConfigValues,
} from "./internal/types";
export {
  configV2Resource,
  configV2ValuesSchema,
  configV2ValidationIssueSchema,
  configV2ConflictEntrySchema,
  configV2ConflictsSchema,
  configV2ConflictResource,
  configV2TiersSchema,
  configV2TiersResource,
  configV2ScopesSchema,
  configV2ScopesMapSchema,
  configV2ScopesResource,
  configV2ConflictPathsSchema,
  configV2ConflictPathsResource,
  configV2ModifiedCountsSchema,
  configV2ModifiedCountsResource,
} from "./internal/resource";
export type { ConfigV2Values, ConfigV2ValidationIssue, ConfigV2ConflictEntry, ConfigV2Conflicts, ConfigV2Tiers, ConfigV2Scopes, ConfigV2ScopesMap, ConfigV2ConflictPaths, ConfigV2ModifiedCounts } from "./internal/resource";
export type { ConfigProxy } from "./internal/config-proxy";
export {
  computeHash,
  stringifyConfigValue,
  codeConfigProxy,
  readonlyProxy,
} from "./internal/config-proxy";
export {
  effective,
  hasConflict,
  propagate,
  threeWayMerge,
  readTypedConfig,
  validationIssues,
} from "./internal/tier-logic";
export { setConfigField, forkScope, deleteScope, forkDescriptorScope, removeDescriptorScope, configSnapshot } from "./internal/endpoints";
export { APP_SCOPE_DIR, scopeAppId, appScopeId } from "./internal/scope-format";
export { configFileOwner } from "./internal/config-file-owner";
export {
  orphanFileRoleSchema,
  orphanRiskClassSchema,
  orphanReasonSchema,
  orphanFileSchema,
  orphanEntrySchema,
  orphanReportSchema,
} from "./internal/orphan-report";
export type {
  OrphanFileRole,
  OrphanRiskClass,
  OrphanReason,
  OrphanFile,
  OrphanEntry,
  OrphanReport,
} from "./internal/orphan-report";
