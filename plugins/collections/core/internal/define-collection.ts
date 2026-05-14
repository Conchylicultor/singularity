import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import type { FieldsRecord, InferRow } from "./field-types";
import type { CollectionOptions, CollectionDefinition } from "./types";
import { buildTable } from "./table-builder";
import { buildSchemas } from "./schema-builder";

export function defineCollection<F extends FieldsRecord>(
  opts: CollectionOptions<F>,
): CollectionDefinition<F> {
  const table = buildTable(opts);
  const schemas = buildSchemas(opts);

  const descriptor = resourceDescriptor<InferRow<F>[]>(
    opts.key,
    z.array(schemas.rowSchema) as unknown as z.ZodType<InferRow<F>[]>,
    [],
  );

  return Object.freeze({
    key: opts.key,
    tableName: opts.tableName,
    table,
    fields: opts.fields,
    schemas,
    resourceDescriptor: descriptor,
    options: opts,
  });
}
