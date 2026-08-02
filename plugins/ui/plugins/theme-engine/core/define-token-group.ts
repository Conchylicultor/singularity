export interface TokenGroupField {
  default: string;
  label?: string;
}

export type TokenGroupSchema = Record<string, TokenGroupField>;

export interface TokenGroupDescriptor<
  T extends TokenGroupSchema = TokenGroupSchema,
> {
  id: string;
  schema: T;
  vars: { [K in keyof T]: string };
}

function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

export function defineTokenGroup<T extends TokenGroupSchema>(
  id: string,
  schema: T,
): TokenGroupDescriptor<T> {
  const vars = {} as Record<string, string>;
  for (const key of Object.keys(schema)) {
    vars[key] = `--${camelToKebab(key)}`;
  }
  return { id, schema, vars: vars as { [K in keyof T]: string } };
}

/**
 * Does any token in `group` match the customizer's search box?
 *
 * The theme customizer's sections filter themselves by the pane-wide `search`
 * string, and every one of them filters on the SAME thing — a token's label or
 * its CSS variable name. Hoisting that predicate here gives each section one
 * expression to hand `useAvailable`, so a non-matching section disappears
 * instead of leaving a titled card the user opens onto an empty token list.
 *
 * `extraTerms` covers a section that is findable by more than its tokens — the
 * shadow editor answers to "blur" and "opacity", which are parameters of its
 * editor rather than tokens of its group.
 *
 * An empty query matches everything: no search ⇒ no filtering.
 */
export function tokenGroupMatchesSearch(
  group: TokenGroupDescriptor,
  search: string,
  extraTerms: readonly string[] = [],
): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  if (extraTerms.some((term) => term.toLowerCase().includes(q))) return true;
  return Object.keys(group.schema).some((key) => {
    const label = group.schema[key]?.label ?? key;
    const cssVar = group.vars[key] ?? "";
    return label.toLowerCase().includes(q) || cssVar.toLowerCase().includes(q);
  });
}
