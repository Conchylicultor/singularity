import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { Fields, resolveFieldStorage } from "./internal/storage";
export type {
  StorageColumnBuilder,
  FieldStorageContribution,
} from "./internal/storage";

export default {
  description:
    "Storage-dimension registry: owns the fields.storage server slot where each field type contributes its Drizzle column builder, keyed by type token.",
} satisfies ServerPluginDefinition;
