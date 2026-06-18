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
  configV2ConflictsResource,
  configV2TiersSchema,
  configV2TiersResource,
  configV2ScopesSchema,
  configV2ScopesResource,
  configV2ConflictPathsSchema,
  configV2ConflictPathsResource,
  configV2ModifiedCountsSchema,
  configV2ModifiedCountsResource,
  configV2ScopeForkedSchema,
  configV2ScopeForkedResource,
} from "./internal/resource";
export type { ConfigV2Values, ConfigV2ValidationIssue, ConfigV2Conflicts, ConfigV2Tiers, ConfigV2Scopes, ConfigV2ConflictPaths, ConfigV2ModifiedCounts, ConfigV2ScopeForked } from "./internal/resource";
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
