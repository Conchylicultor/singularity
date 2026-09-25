// The dialect-free SQL template an op carries next to its in-memory `test`.
// `core/` stays browser-safe: a template is plain data (literal SQL text and
// typed holes), and only the server renders it into drizzle `sql` — see
// `server/internal/render.ts`. The literal text IS Postgres; what it avoids is
// a drizzle import, not the dialect.

/** The rendered comparison target — a SQL expression, never a drizzle column. */
export const T = { hole: "target" } as const;
/** The operand, bound as ONE scalar param cast to the domain's SQL type. */
export const P = { hole: "operand" } as const;
/** The list operand, bound as ONE array param cast to the domain's SQL array type. */
export const L = { hole: "list" } as const;
/** Inside an {@link orEach} body: the current list element, bound as one scalar param. */
export const X = { hole: "element" } as const;

/** The OR of `body` rendered once per list element (`FALSE` for an empty list). */
export interface OrEachHole {
  readonly hole: "orEach";
  readonly body: Tpl;
}

export type TplHole = typeof T | typeof P | typeof L | typeof X | OrEachHole;

/** `strings.length === holes.length + 1`, exactly as a tagged template's. */
export interface Tpl {
  readonly strings: readonly string[];
  readonly holes: readonly TplHole[];
}

export function tpl(
  strings: TemplateStringsArray,
  ...holes: readonly TplHole[]
): Tpl {
  return { strings: [...strings], holes };
}

/**
 * `(body₁) OR (body₂) …` over the list operand — for a predicate that must
 * stay one index-usable operator per element (jsonb `@>` under a
 * `jsonb_path_ops` GIN index has no "any of" form).
 */
export function orEach(body: Tpl): OrEachHole {
  return { hole: "orEach", body };
}

/** `(<pos>) IS NOT TRUE` — the complement of a predicate under three-valued logic. */
export function complementTpl(pos: Tpl): Tpl {
  const strings = [...pos.strings];
  strings[0] = `(${strings[0]!}`;
  strings[strings.length - 1] = `${strings[strings.length - 1]!}) IS NOT TRUE`;
  return { strings, holes: pos.holes };
}
