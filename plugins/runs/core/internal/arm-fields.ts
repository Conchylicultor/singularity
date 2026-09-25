import type { FilterDomainId } from "@plugins/network/plugins/live/plugins/filter/core";
import type { UnionColumnSpecs } from "@plugins/primitives/plugins/data-view/plugins/union-query/core";
import { RUN_BASE_COLUMNS } from "./base-columns";

/**
 * The field types an arm column may declare, and the filter-language domain
 * each is filtered in — `null` for a column only ever READ (a jsonb blob the
 * row renders), which is then neither filterable nor sortable. A closed list:
 * these are the types `runs/web`'s arm accessors can read.
 */
export const RUN_COLUMN_DOMAINS = {
  text: "text",
  "multiline-text": "text",
  enum: "text",
  "dynamic-enum": "text",
  uuid: "text",
  "directory-path": "text",
  color: "text",
  number: "number",
  int: "number",
  float: "number",
  tags: "stringArray",
  list: "stringArray",
  "string-list": "stringArray",
  bool: "boolean",
  date: "instant",
  json: null,
} as const satisfies Record<string, FilterDomainId | null>;

export type RunColumnType = keyof typeof RUN_COLUMN_DOMAINS;

/**
 * One extra column an arm contributes.
 *
 * `type` is the field-type id the web `FieldDef` carries — and, through
 * {@link RUN_COLUMN_DOMAINS}, the filter-language domain the server filters it
 * in; `sqlType` is the Postgres type the *other* arms cast their NULL to, which
 * is what lets the arms be `UNION ALL`ed at all. Both are declared once, here,
 * and read by both runtimes. A `tags` column must be a jsonb string array (the
 * `stringArray` domain's containment ops are jsonb ops).
 */
export interface RunColumnSpec {
  /** Field-type id: `"text"`, `"enum"`, `"date"`, `"number"`, `"bool"`, `"tags"`, `"json"`, … */
  type: RunColumnType;
  /** Postgres type — what every other arm's NULL is cast to for this column. */
  sqlType: string;
  /** May this column be NULL on rows of THIS arm? (It is NULL on every other.) */
  nullable?: boolean;
}

/** An arm's whole extra-column declaration: namespaced id → spec. */
export type RunArmFieldSpecs = Record<string, RunColumnSpec>;

/**
 * Declare one arm's extra columns — the fields only that kind has.
 *
 * This one object is what both runtimes bind to. On the server, `defineRunKind`
 * demands a column expression for **exactly** these keys, so a declared field
 * with no column (or a column with no declared field) is a `tsc` error. On the
 * web, `runArmFields` demands a `FieldDef` whose `id` is one of these keys and
 * whose `type` matches, and the merged surface declares these columns (by
 * domain) as filterable — so a web field can never filter through a column the
 * server does not have.
 *
 * Every id must be namespaced `<kind>.<id>`. That is not decoration:
 * `release_runs` already has a `kind` column of its own (`staged` / `candidate`),
 * and an unnamespaced `kind` would shadow the discriminator the whole union
 * rests on. The prefix also makes ids globally unique across arms for free.
 */
export function defineRunArmFields<const S extends RunArmFieldSpecs>(
  kind: string,
  fields: S,
): S {
  const prefix = `${kind}.`;
  for (const id of Object.keys(fields)) {
    if (!id.startsWith(prefix)) {
      throw new Error(
        `[runs] arm field "${id}" of kind "${kind}" must be namespaced "${prefix}<id>" — ` +
          `an unnamespaced id can collide with a base column or with another arm's field.`,
      );
    }
    if (id in RUN_BASE_COLUMNS) {
      throw new Error(
        `[runs] arm field "${id}" collides with a base column of the same name.`,
      );
    }
  }
  return fields;
}

/**
 * Every arm's extra columns, merged into the one union spec map — each column's
 * domain derived from its declared type. Ids are namespaced by kind, so a
 * collision means two arms claimed the same `kind` prefix — a registration bug,
 * and loud rather than a column one arm silently loses.
 */
export function runArmUnionSpecs(
  arms: readonly RunArmFieldSpecs[],
): UnionColumnSpecs {
  const merged: UnionColumnSpecs = {};
  for (const fields of arms) {
    for (const [id, spec] of Object.entries(fields)) {
      if (id in merged) {
        throw new Error(
          `[runs] arm field "${id}" is declared by more than one run kind.`,
        );
      }
      merged[id] = {
        domain: RUN_COLUMN_DOMAINS[spec.type],
        sqlType: spec.sqlType,
        nullable: spec.nullable,
      };
    }
  }
  return merged;
}
