// Parses the CLAUSE of an emitted import/re-export statement — the text between
// the keyword and the module specifier, i.e. `src.slice(imp.ss, imp.s)` for an
// es-module-lexer import record. es-module-lexer reports the specifier and its
// kind but never the bound names, so the names must come from the source text.
//
// This is intentionally a pure, unit-tested helper rather than an inline regex
// in the scanner, because of ONE trap that is invisible in the lexer's output:
// es-module-lexer reports `export { A } from "x"` in the IMPORTS array with
// `d === -1` — indistinguishable from a real static import by any field. A
// parser that reads the leading identifier before `{` as a default binding then
// reads the keyword `export` ITSELF as a default import, inventing a phantom
// `default` requirement on the target and failing the fleet build. Hence the
// keyword is stripped FIRST and `isReexport` gates the default heuristic.
//
// Scope note: the emitted fleet's clauses are single-line and free of comments,
// newlines and string-literal binding names under both minify-on
// (`import{a as s}from"…"`) and `--no-minify`. The parser still strips block
// comments and quotes defensively — a bundler-output change must degrade toward
// a skipped check, never toward a false failure.

export interface ImportClause {
  /** The statement is a re-export (`export … from`), not an import. */
  isReexport: boolean;
  /** Binds the whole namespace (`import * as ns`, `export * as ns from`): the
   *  imported names are not statically knowable, so links are not verified. */
  namespace: boolean;
  /** `export * from` — re-exports the target's names wholesale (no `as`). */
  star: boolean;
  hasDefault: boolean;
  /** The IMPORTED names, local aliases discarded (`{ A as b }` → `"A"`).
   *  `{ default as X }` counts as `hasDefault`, never as a name. */
  names: string[];
}

const EMPTY: ImportClause = {
  isReexport: false,
  namespace: false,
  star: false,
  hasDefault: false,
  names: [],
};

/** Strip surrounding quotes from a string-literal binding name (`{"a-b" as c}`). */
function unquote(name: string): string {
  const q = name[0];
  if ((q === '"' || q === "'") && name.endsWith(q) && name.length >= 2) return name.slice(1, -1);
  return name;
}

/** Parse `{ a, b as c, default as D }` into its imported names + default flag. */
function parseNamed(inner: string, out: ImportClause): void {
  for (const entry of inner.split(",")) {
    const imported = unquote(entry.trim().split(/\s+as\s+/)[0]!.trim());
    if (imported === "") continue; // trailing comma / `{}`
    if (imported === "default") out.hasDefault = true;
    else out.names.push(imported);
  }
}

/**
 * Parse the clause text of an emitted import/re-export statement — everything
 * from the `import`/`export` keyword up to (and possibly including part of) the
 * `from "` that precedes the specifier. Unrecognized shapes yield an empty
 * clause, i.e. nothing to verify — never an invented requirement.
 */
export function parseImportClause(text: string): ImportClause {
  // `from "` / `from '` remnant and any block comment: neither carries bindings.
  let rest = text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .trim()
    .replace(/['"]$/, "")
    .trim()
    .replace(/\bfrom$/, "")
    .trim();

  // The keyword FIRST — see the phantom-default trap in the header.
  const isReexport = /^export\b/.test(rest);
  if (isReexport) rest = rest.slice("export".length).trim();
  else if (/^import\b/.test(rest)) rest = rest.slice("import".length).trim();
  else return { ...EMPTY }; // not a clause we recognize: verify nothing

  const out: ImportClause = { ...EMPTY, isReexport, names: [] };
  if (rest === "") return out; // side-effect import: `import "x"`
  if (rest.startsWith("(")) return out; // dynamic `import("x")`: no static bindings

  if (rest.startsWith("*")) {
    // `* as ns` binds a namespace object (nothing statically checkable); a bare
    // `export *` re-exports the target's names wholesale, which is what makes an
    // importer's own export set incomplete (an "opaque" target).
    if (/^\*\s*as\b/.test(rest)) out.namespace = true; // minifiers emit `import*as n from`
    else out.star = isReexport;
    return out;
  }

  const brace = rest.indexOf("{");
  if (brace >= 0) {
    const head = rest.slice(0, brace).replace(/,\s*$/, "").trim();
    // A default binding can only precede the braces on the IMPORT side; on the
    // export side `head` is empty — never treat leftover text as a default.
    if (head !== "" && !isReexport) out.hasDefault = true;
    const close = rest.indexOf("}", brace);
    parseNamed(rest.slice(brace + 1, close < 0 ? rest.length : close), out);
    return out;
  }

  // `import X` / `import X, * as ns` — the only remaining import-side shapes.
  if (!isReexport) {
    const [first, ...tail] = rest.split(",");
    if (first!.trim() !== "") out.hasDefault = true;
    if (tail.some((t) => t.trim().startsWith("*"))) out.namespace = true;
  }
  return out;
}
