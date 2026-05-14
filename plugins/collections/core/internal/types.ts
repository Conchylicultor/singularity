import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import type { z } from "zod";
import type { ResourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import type {
  FieldsRecord,
  InferRow,
} from "./field-types";

export type CollectionTable<F extends FieldsRecord> = PgTable &
  { id: AnyPgColumn; createdAt: AnyPgColumn; updatedAt: AnyPgColumn } &
  { rank: AnyPgColumn } &
  { [K in keyof F]: AnyPgColumn };

export interface CollectionOptions<F extends FieldsRecord> {
  key: string;
  tableName: string;
  fields: F;
  primaryKey?: keyof F & string;
  ranked?: boolean;
}

export interface CollectionSchemas {
  rowSchema: z.ZodObject<z.ZodRawShape>;
  createSchema: z.ZodObject<z.ZodRawShape>;
  updateSchema: z.ZodObject<z.ZodRawShape>;
}

export interface CollectionDefinition<F extends FieldsRecord> {
  readonly key: string;
  readonly tableName: string;
  readonly table: CollectionTable<F>;
  readonly fields: F;
  readonly schemas: CollectionSchemas;
  readonly resourceDescriptor: ResourceDescriptor<InferRow<F>[]>;
  readonly options: CollectionOptions<F>;
}
