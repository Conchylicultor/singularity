export { defineConfig } from "./internal/define-config";
export { buildFieldsSchema, fieldSchemaWithDefault } from "./internal/schema-builder";
export { pickMeta } from "./internal/pick-meta";
// TEMPORARY re-export shim — unified-fields migration, stage S1→S4
// (research/2026-06-07-global-unify-fieldtype-token.md). fields/core now owns the
// FieldType token; config_v2's ~13 field-type plugins migrate to @plugins/fields/core
// incrementally (tasks 5–7). Remove this block AND its plugin-boundaries allowlist
// entry once the last importer is migrated (task 8). Sanctioned cross-plugin re-export.
export { defineFieldType } from "@plugins/fields/core";
export type { FieldType } from "@plugins/fields/core";
export type {
  Disposable,
  FieldDef,
  FieldMeta,
  FieldsRecord,
  JsonValue,
  ConfigDescriptor,
  ConfigValues,
  InferFieldValue,
  InferFieldsObject,
} from "./internal/types";
export {
  configV2Resource,
  configV2ValuesSchema,
  configV2ConflictEntrySchema,
  configV2ConflictsSchema,
  configV2ConflictsResource,
  configV2TiersSchema,
  configV2TiersResource,
  configV2ScopeForkedSchema,
  configV2ScopeForkedResource,
} from "./internal/resource";
export type { ConfigV2Values, ConfigV2Conflicts, ConfigV2Tiers, ConfigV2ScopeForked } from "./internal/resource";
export type { ConfigProxy } from "./internal/config-proxy";
export {
  computeHash,
  codeConfigProxy,
  readonlyProxy,
} from "./internal/config-proxy";
export {
  registerFieldResolver,
  getFieldResolver,
} from "./internal/field-resolvers";
export {
  effective,
  hasConflict,
  propagate,
  readTypedConfig,
  validationIssues,
} from "./internal/tier-logic";
export { setConfigField, forkScope, deleteScope, configSnapshot } from "./internal/endpoints";
