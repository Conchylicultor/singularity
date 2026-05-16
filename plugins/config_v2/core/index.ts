export { defineConfig } from "./internal/define-config";
export { buildFieldsSchema } from "./internal/schema-builder";
export { defineFieldType } from "./internal/types";
export type {
  FieldDef,
  FieldMeta,
  FieldType,
  FieldsRecord,
  ConfigDescriptor,
  ConfigValues,
  InferFieldValue,
  InferFieldsObject,
} from "./internal/types";
