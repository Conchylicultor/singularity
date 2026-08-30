import { RUN_BASE_COLUMNS } from "./base-columns";

/**
 * One extra column an arm contributes.
 *
 * `type` is the field-type id the web `FieldDef` carries and the server resolves
 * filter operators through; `sqlType` is the Postgres type the *other* arms cast
 * their NULL to, which is what lets the arms be `UNION ALL`ed at all. Both are
 * declared once, here, and read by both runtimes.
 */
export interface RunColumnSpec {
  /** Field-type id: `"text"`, `"enum"`, `"date"`, `"number"`, `"bool"`, `"tags"`, … */
  type: string;
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
 * whose `type` matches, so a web field id can never drift from the server column
 * key it filters through — the silent degradation into client-side-only
 * filtering over the loaded window that data-view's own docs warn about.
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
