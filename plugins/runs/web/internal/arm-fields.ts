import type { FieldDef } from "@plugins/primitives/plugins/data-view/web";
import type { RunArmFieldSpecs, UnionRun } from "../../core";

/**
 * An arm's `FieldDef`s, bound to the arm's own column declaration.
 *
 * The binding is the whole point. A DataView field id that does not match a
 * server column key does not fail — it silently degrades into client-side-only
 * filtering over the loaded window, which looks like a working filter that
 * returns the wrong answer. Here the id is typed `keyof S`, so a typo will not
 * compile, and the declared `type` is checked against the column spec at
 * module-eval, so a field that filters as `text` over an `integer` column is
 * caught the first time the arm loads rather than the first time someone
 * filters on it.
 *
 * ```ts
 * export const buildRunFields = defineRunArmFields("build", {
 *   "build.targets": { type: "tags", sqlType: "text[]" },
 * });                                   // ← in the arm's core/
 *
 * runArmFields(buildRunFields, [
 *   { id: "build.targets", label: "Targets", type: "tags", values: (r) => … },
 * ]);                                   // ← in the arm's web/
 * ```
 */
export function runArmFields<S extends RunArmFieldSpecs>(
  specs: S,
  defs: (Omit<FieldDef<UnionRun>, "id" | "type"> & {
    id: Extract<keyof S, string>;
    type: string;
  })[],
): FieldDef<UnionRun>[] {
  for (const def of defs) {
    const spec = specs[def.id];
    if (!spec) {
      throw new Error(
        `[runs] field "${def.id}" is not declared in this arm's defineRunArmFields()`,
      );
    }
    if (spec.type !== def.type) {
      throw new Error(
        `[runs] field "${def.id}" is declared as "${spec.type}" on the server column but ` +
          `rendered as "${def.type}" — the filter operators would not match the SQL.`,
      );
    }
  }
  return defs;
}
