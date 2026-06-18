import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { defineEntity } from "./internal/define-entity";
export { defaultNow, defaultRandom, sqlDefault } from "./internal/types";
export type {
  Entity,
  EntityMeta,
  EntityColumnMeta,
  EntityColumns,
  EntityRow,
  ColumnDefault,
  DbDefault,
} from "./internal/types";

export default {
  description:
    "Derives a Drizzle pgTable AND a zod wire schema from one FieldsRecord, so entity.table.$inferSelect is identical by construction to z.infer<entity.schema>. Field-set drift becomes a tsc error; loaders drop their row projection.",
} satisfies ServerPluginDefinition;
