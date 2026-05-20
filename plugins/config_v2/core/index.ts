export { defineConfig } from "./internal/define-config";
export { buildFieldsSchema } from "./internal/schema-builder";
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
export { configV2Resource, configV2ValuesSchema } from "./internal/resource";
export type { ConfigV2Values } from "./internal/resource";
export type { ConfigProxy } from "./internal/config-proxy";
export {
  computeHash,
  codeConfigProxy,
  readonlyProxy,
} from "./internal/config-proxy";
export {
  effective,
  hasConflict,
  propagate,
  readTypedConfig,
} from "./internal/tier-logic";
