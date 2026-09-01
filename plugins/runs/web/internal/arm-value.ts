import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import type { RunArmFieldSpecs, UnionRun } from "../../core";

/**
 * Reading an arm's own column off a merged row.
 *
 * `UnionRun`'s arm half is a `catchall(unknown)` — `runs` knows the base columns
 * exactly and nothing about an arm's, which is what lets an arm be added without
 * editing `runs/core`. The cost lands here: every arm needs the same
 * `unknown` → `FieldValue` step, and four arms wrote the same four functions
 * before this file existed.
 *
 * Two rules, and they are not the same rule:
 *
 * - **A null value is an answer.** The column IS null on every row of every
 *   other kind — that is the whole point of the union — so `null` comes back as
 *   `null` and the cell renders empty.
 * - **A wrong SHAPE throws.** A `number` column arriving as a string means the
 *   arm's `sqlType` produces a Postgres type `pg` has no decoder for (the
 *   `numeric` / `bigint` trap), and that is a bug the arm must fix, not a value
 *   to coerce past. The message names the column and the fix.
 *
 * The accessor is bound to the arm's own `defineRunArmFields` declaration twice
 * over: `armNumber(specs, "build.targets")` does not compile when that column
 * was declared `tags`, and the same disagreement in a hand-written specs object
 * throws when the accessor is built. That is the binding `runArmFields` makes
 * for `FieldDef.id`, applied to the other half of the field.
 */

/** The ids in `S` whose declared field type is one of `T`. */
type IdsWithType<S extends RunArmFieldSpecs, T extends string> = Extract<
  { [K in keyof S]: S[K]["type"] extends T ? K : never }[keyof S],
  string
>;

/** Field types whose value is a plain string. */
const TEXT_TYPES = [
  "text",
  "multiline-text",
  "enum",
  "dynamic-enum",
  "uuid",
  "directory-path",
  "color",
] as const;
/** Field types whose value is a JS number. */
const NUMBER_TYPES = ["number", "int", "float"] as const;
/** Field types whose value is a list of strings. */
const TAGS_TYPES = ["tags", "list", "string-list"] as const;

type TextType = (typeof TEXT_TYPES)[number];
type NumberType = (typeof NUMBER_TYPES)[number];
type TagsType = (typeof TAGS_TYPES)[number];

/**
 * A column present on this row, or `undefined` when it is not projected at all.
 *
 * Absent is NOT the same as null and is not treated as a shape error: the
 * projected column set comes from the arms the SERVER has registered, so a web
 * half whose server half is out of the composition sees no key rather than a
 * null one. Reading that as "no value" keeps the surface rendering; a throw
 * would take the whole list down over one absent arm.
 */
function read(run: UnionRun, id: string): unknown {
  return (run as unknown as Record<string, unknown>)[id];
}

/**
 * The runtime half of the binding: the id must be declared, and its declared
 * type must be one this accessor can read. Runs when the accessor is built (a
 * module-eval or `useMemo` call), not per row.
 */
function bind(
  specs: RunArmFieldSpecs,
  id: string,
  accepted: readonly string[],
): void {
  const spec = specs[id];
  if (!spec) {
    throw new Error(
      `[runs] "${id}" is not declared in this arm's defineRunArmFields()`,
    );
  }
  if (!accepted.includes(spec.type)) {
    throw new Error(
      `[runs] arm column "${id}" is declared "${spec.type}", which this accessor cannot read ` +
        `(it reads ${accepted.join(" | ")}).`,
    );
  }
}

function wrongShape(id: string, value: unknown, expected: string): Error {
  return new Error(
    `[runs] arm column "${id}" holds ${typeof value} where ${expected} was declared. ` +
      `Either the FieldDef's type disagrees with the column, or the column's sqlType ` +
      `produces a Postgres type pg does not decode (numeric / bigint arrive as strings — ` +
      `declare double precision / integer, or cast in the arm's column expression).`,
  );
}

/** A `string` arm column, as a `FieldDef.value` accessor. */
export function armText<S extends RunArmFieldSpecs>(
  specs: S,
  id: IdsWithType<S, TextType>,
): (run: UnionRun) => string | null {
  bind(specs, id, TEXT_TYPES);
  return (run) => {
    const v = read(run, id);
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") throw wrongShape(id, v, "a string");
    return v;
  };
}

/** A numeric arm column, as a `FieldDef.value` accessor. */
export function armNumber<S extends RunArmFieldSpecs>(
  specs: S,
  id: IdsWithType<S, NumberType>,
): (run: UnionRun) => number | null {
  bind(specs, id, NUMBER_TYPES);
  return (run) => {
    const v = read(run, id);
    if (v === null || v === undefined) return null;
    if (typeof v !== "number") throw wrongShape(id, v, "a number");
    return v;
  };
}

/** A boolean arm column, as a `FieldDef.value` accessor. */
export function armBool<S extends RunArmFieldSpecs>(
  specs: S,
  id: IdsWithType<S, "bool">,
): (run: UnionRun) => boolean | null {
  bind(specs, id, ["bool"]);
  return (run) => {
    const v = read(run, id);
    if (v === null || v === undefined) return null;
    if (typeof v !== "boolean") throw wrongShape(id, v, "a boolean");
    return v;
  };
}

/**
 * A timestamp arm column, as a `FieldDef.value` accessor.
 *
 * Arrives as an ISO **string**, not a `Date`: only the base columns are decoded
 * by `UnionRunSchema` (`z.coerce.date()`), and an arm column rides the
 * `catchall` as raw JSON. So this is the one accessor that constructs rather
 * than checks — and an unparseable string is a shape error like any other.
 */
export function armDate<S extends RunArmFieldSpecs>(
  specs: S,
  id: IdsWithType<S, "date">,
): (run: UnionRun) => Date | null {
  bind(specs, id, ["date"]);
  return (run) => {
    const v = read(run, id);
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v;
    if (typeof v !== "string") throw wrongShape(id, v, "a date");
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw wrongShape(id, v, "a parseable date");
    return d;
  };
}

/**
 * A structured (jsonb) arm column, decoded by the arm's own schema.
 *
 * The member of this family an arm cannot write for itself: a `json` column
 * arrives as `unknown` with no shape the accessor could check, so the arm has to
 * supply the check. It supplies a schema, and the schema IS the check — a wrong
 * shape throws out of `.parse`, which is this file's "a wrong shape throws" rule
 * expressed by the only code that knows the shape.
 *
 * Null is still an answer (the column is null on every other kind's rows), and
 * the parse is per row rather than at build time, since there is no row to check
 * when the accessor is built.
 *
 * `ZodParser` is imported **type-only**: the schema is the arm's, so `runs/web`
 * names zod without depending on it at runtime.
 */
export function armJson<S extends RunArmFieldSpecs, T>(
  specs: S,
  id: IdsWithType<S, "json">,
  schema: ZodParser<T>,
): (run: UnionRun) => T | null {
  bind(specs, id, ["json"]);
  return (run) => {
    const v = read(run, id);
    if (v === null || v === undefined) return null;
    return schema.parse(v);
  };
}

/**
 * A multi-value arm column, as a `FieldDef.values` accessor.
 *
 * `values` has no null arm — a row either has tags or has none — and on another
 * kind's row "this column does not apply" and "no tags" render identically, so
 * the empty list is the honest reading rather than an absorbed one. A
 * non-array, or an array holding a non-string, is still a shape error.
 */
export function armTags<S extends RunArmFieldSpecs>(
  specs: S,
  id: IdsWithType<S, TagsType>,
): (run: UnionRun) => string[] {
  bind(specs, id, TAGS_TYPES);
  return (run) => {
    const v = read(run, id);
    if (v === null || v === undefined) return [];
    if (!Array.isArray(v)) throw wrongShape(id, v, "an array of strings");
    for (const entry of v) {
      if (typeof entry !== "string") {
        throw wrongShape(id, entry, "an array of strings");
      }
    }
    return v as string[];
  };
}
