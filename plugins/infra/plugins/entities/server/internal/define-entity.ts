import { z } from "zod";
import { pgTable, primaryKey } from "drizzle-orm/pg-core";
import { resolveFieldStorage } from "@plugins/fields/server";
import { fieldsToZodObject } from "@plugins/fields/core";
import type { FieldsRecord } from "@plugins/fields/core";
import { snakeCase } from "./snake-case";
import type {
  ColumnDefault,
  DbDefault,
  DefaultedKeys,
  Entity,
  EntityColumns,
  EntityMeta,
} from "./types";

// A bare (non-marker) default value. Markers carry a `kind` discriminant; a
// bare literal never does (we forbid object literals from masquerading as
// markers by requiring the exact `kind` keys).
function isMarker(def: ColumnDefault<unknown>): def is DbDefault<unknown> {
  return def !== null && typeof def === "object" && "kind" in def;
}

// A raw field schema is nullable (column stays nullable, no `.notNull()`) iff
// it is a ZodOptional or ZodNullable. Derived from the RAW `field.schema`
// (before `fieldsToZodObject` wraps it with `.default()`), so wire and column
// nullability can never drift.
function isNullableSchema(schema: z.ZodTypeAny): boolean {
  return schema instanceof z.ZodOptional || schema instanceof z.ZodNullable;
}

// Apply an opt-in DB-column default. Bare value = `{ kind: "literal" }` sugar.
// `b` is the `as any` builder (see assembly loop) so the chain methods are
// reachable; `defaultRandom`/`defaultNow` only exist on uuid/timestamp builders
// and throw loudly at runtime if mis-targeted (guarded below).
function applyDefault(b: any, def: ColumnDefault<unknown>, key: string): any {
  if (!isMarker(def)) return b.default(def); // bare value sugar
  switch (def.kind) {
    case "now":
      if (typeof b.defaultNow !== "function") {
        throw new Error(
          `defineEntity: column "${key}" uses defaultNow() but its storage ` +
            `builder has no .defaultNow() (valid only for date/timestamp fields).`,
        );
      }
      return b.defaultNow();
    case "random":
      if (typeof b.defaultRandom !== "function") {
        throw new Error(
          `defineEntity: column "${key}" uses defaultRandom() but its storage ` +
            `builder has no .defaultRandom() (valid only for uuid fields).`,
        );
      }
      return b.defaultRandom();
    case "sql":
      return b.default(def.sql);
    case "literal":
      return b.default(def.value);
  }
}

// Derive a Drizzle `pgTable` AND a zod wire schema from ONE `FieldsRecord`, so
// `entity.table.$inferSelect` is identical by construction to
// `z.infer<entity.schema>`. See the Stage C plan for the full derivation.
// `const M` infers the `meta` literally. Without it, a bare string-literal
// default on a union-typed (enum-branded) field — `{ default: "starting" }`
// where the field value is `"starting" | "working" | …` — is contextually typed
// against `ColumnDefault<union>` and TS widens the WHOLE `columns` object to the
// `EntityMeta.columns` constraint shape (optional `default?`), collapsing
// `DefaultedKeys` to `never` (every DB-defaulted column wrongly becomes required
// on insert). `const` keeps each column meta at its narrow literal type so the
// presence of `default` survives. (A non-enum default — bool / plain text — never
// triggered the collapse, which is why slow_ops never caught it.)
export function defineEntity<
  F extends FieldsRecord,
  const M extends EntityMeta<F> = EntityMeta<F>,
>(name: string, fields: F, meta: M = {} as M): Entity<F, DefaultedKeys<F, M>> {
  const builders: Record<string, unknown> = {};

  for (const [key, field] of Object.entries(fields)) {
    const build = resolveFieldStorage(field.type.id);
    if (!build) {
      throw new Error(
        `defineEntity("${name}"): field "${key}" has type "${field.type.id}" ` +
          `with no fields.storage contribution — no DB column mapping. ` +
          `Contribute Fields.Storage({ type, build }) for this type.`,
      );
    }

    const columnName = meta.columns?.[key]?.name ?? snakeCase(key);
    // One `as any` at the runtime/type boundary: `PgColumnBuilderBase` doesn't
    // surface the chain methods. The precise type rides in the cast below
    // (entity-extensions sets the `as unknown as` precedent).
    let b = build(columnName) as any;

    // Runtime no-op, but carries `$type<T>()` into the DDL (e.g. jsonb<T>).
    b = b.$type();

    if (!isNullableSchema(field.schema)) b = b.notNull();
    if (meta.primaryKey === key) b = b.primaryKey();

    const colMeta = meta.columns?.[key];
    if (colMeta && "default" in colMeta) {
      b = applyDefault(b, colMeta.default as ColumnDefault<unknown>, key);
    }

    // Opt-in FK: lazy column thunk + onDelete/onUpdate, faithfully forwarded to
    // drizzle's native `.references(thunk, actions)`. Omitted actions fall back
    // to drizzle's NO ACTION default (Postgres's own default). FKs affect only
    // the DDL, never the row type — hence absent from `EntityColumns`.
    if (colMeta?.references) {
      const { column, onDelete, onUpdate } = colMeta.references;
      b = b.references(column, { onDelete, onUpdate });
    }

    builders[key] = b;
  }

  // Third-arg callback: composite PK (when `primaryKey` is an array) + the
  // index passthrough. `t` is keyed by JS property name.
  const extraConfig = (t: any) => [
    ...(Array.isArray(meta.primaryKey)
      ? [
          primaryKey({
            // map() widens to any[]; drizzle wants a non-empty tuple.
            columns: meta.primaryKey.map((k) => t[k]) as [any, ...any[]],
          }),
        ]
      : []),
    ...(meta.indexes?.(t) ?? []),
  ];

  // The one load-bearing cast: feed the loosely-assembled map as the precise
  // `EntityColumns<F, …>` so `pgTable`'s own `BuildColumns` infers the exact
  // select type AND marks DB-defaulted columns optional on insert (the `D`
  // brand). `extraConfig` is `as any` because `t` was loosened above.
  const table = pgTable(
    name,
    builders as unknown as EntityColumns<F, DefaultedKeys<F, M>>,
    extraConfig,
  );

  const schema = fieldsToZodObject(fields);

  return Object.freeze({ name, table, schema }) as Entity<F, DefaultedKeys<F, M>>;
}
