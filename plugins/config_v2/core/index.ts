export { defineConfig } from "./internal/define-config";
export { buildFieldsSchema, fieldSchemaWithDefault } from "./internal/schema-builder";
export { defineFieldType } from "./internal/types";
export type {
  Disposable,
  FieldDef,
  FieldMeta,
  FieldType,
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
