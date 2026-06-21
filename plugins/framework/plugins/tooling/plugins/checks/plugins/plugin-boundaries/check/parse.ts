// ============================================================================
// Shared parse helpers for the plugin-boundaries check.
//
// Tokenizer-based (no TypeScript compiler API). stripComments preserves string
// contents so module specifiers survive; splitTopLevelStatements yields
// brace-/semicolon-delimited top-level statements; extractFromSpecifier pulls a
// trailing `from "<mod>"`; parseBindingList parses an ESM binding clause.
// ============================================================================

/**
 * Strip only comments (line and block), preserving string-literal contents
 * so module specifiers in imports survive. Maintains line positions.
 */
export function stripComments(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      continue;
    }
    if (c === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < n) {
        out += "  ";
        i += 2;
      }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      // Copy the string literal verbatim, skipping escapes.
      const quote = c;
      out += c;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < n) {
          out += src[i]! + src[i + 1]!;
          i += 2;
          continue;
        }
        // Template interpolation: we don't recurse inside ${...}, just copy.
        out += src[i];
        i++;
      }
      if (i < n) {
        out += src[i];
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

export interface TopLevelStmt {
  text: string;
  line: number;
}

/**
 * Split `src` (already comment-/string-stripped) into top-level statements.
 * Statements are delimited by `;` or by newlines where the previous line is
 * statement-complete AND current depth is 0. For simplicity we treat each
 * semicolon-or-EOF segment at brace/paren/bracket depth 0 as one statement.
 */
export function splitTopLevelStatements(src: string): TopLevelStmt[] {
  const out: TopLevelStmt[] = [];
  let depth = 0;
  let start = 0;
  let line = 1;
  let stmtLine = 1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (c === "\n") line++;
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") depth = Math.max(0, depth - 1);
    else if (c === ";" && depth === 0) {
      const text = src.slice(start, i);
      out.push({ text, line: stmtLine });
      start = i + 1;
      stmtLine = line;
    }
  }
  if (start < src.length) {
    const text = src.slice(start);
    if (text.trim()) out.push({ text, line: stmtLine });
  }
  // Also split on top-level newlines where the preceding statement form is
  // complete — specifically, `}` followed by a newline at depth 0 terminates
  // things like `interface X { ... }` and `export default { ... }`. Our
  // semicolon-based split already handles most real cases (TS code uses
  // semicolons or follows ASI conventions where barrels do); the added
  // robustness below catches brace-closed declarations lacking a trailing `;`.
  return expandBraceTerminated(out);
}

function expandBraceTerminated(stmts: TopLevelStmt[]): TopLevelStmt[] {
  const out: TopLevelStmt[] = [];
  for (const s of stmts) {
    const parts = splitByTopLevelBraceClose(s.text, s.line);
    for (const p of parts) out.push(p);
  }
  return out;
}

function splitByTopLevelBraceClose(text: string, baseLine: number): TopLevelStmt[] {
  const out: TopLevelStmt[] = [];
  let depth = 0;
  let start = 0;
  let line = baseLine;
  let stmtLine = baseLine;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === "\n") line++;
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && c === "}") {
        // Look ahead: if next non-whitespace char ends the segment with a newline
        // before any further syntactically meaningful token, split here.
        let j = i + 1;
        while (j < text.length && text[j] !== "\n" && /\s/.test(text[j]!)) j++;
        if (j >= text.length || text[j] === "\n") {
          out.push({ text: text.slice(start, i + 1), line: stmtLine });
          start = i + 1;
          stmtLine = line + (text[j] === "\n" ? 1 : 0);
          i = j;
          if (text[j] === "\n") line++;
        }
      }
    }
  }
  if (start < text.length) {
    const tail = text.slice(start);
    if (tail.trim()) out.push({ text: tail, line: stmtLine });
  }
  return out;
}

export function extractFromSpecifier(stmt: string): string | null {
  const m = stmt.match(/from\s+["']([^"']+)["']\s*$/);
  return m ? m[1]! : null;
}

// ============================================================================
// Binding-list parser
// ============================================================================

/**
 * One binding from an `import`/`export` clause `{ a as b, type c }`.
 *
 * `exported` is the name visible to the OUTSIDE world of the statement:
 *   - for `import { a as b }`  → the in-file local name `b`
 *   - for `export { a as b }`  → the publicly exported name `b`
 * `local` is the name in the MODULE the statement references (or, for a bare
 * `export { a as b }` with no `from`, the in-this-file source name `a`):
 *   - for `import { a as b }`  → `a` (the source module's export name)
 *   - for `export { a as b } from "spec"` → `a` (spec's export name)
 *   - for bare `export { a as b }` → `a` (this file's local name)
 */
export interface Binding {
  /** Name as referenced in the source module (or in-this-file name for bare exports). */
  local: string;
  /** Name as bound on the consuming side (in-file local for imports, public name for exports). */
  exported: string;
  /** True if this specific binding carried a `type` keyword. */
  typeOnly: boolean;
}

/**
 * Parse the `{ a as b, type c }` binding list out of an import/export statement.
 * Returns an empty array for namespace (`* as N`), default-only, wildcard, or
 * bare side-effect forms — callers detect those shapes separately.
 *
 * Standard ESM semantics: inside `{ ... }`, each entry is `name` or
 * `name as alias`, optionally prefixed by `type`. For imports the alias is the
 * in-file local; for exports the alias is the public name. `name` (the
 * pre-`as` token) is the source-module name in both cases.
 */
export function parseBindingList(stmt: string): Binding[] {
  const open = stmt.indexOf("{");
  if (open === -1) return [];
  // Find the matching close brace at the same depth.
  let depth = 0;
  let close = -1;
  for (let i = open; i < stmt.length; i++) {
    const c = stmt[i]!;
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) return [];
  const inner = stmt.slice(open + 1, close);
  const out: Binding[] = [];
  for (const rawPart of inner.split(",")) {
    let part = rawPart.trim();
    if (!part) continue;
    let typeOnly = false;
    const typeMatch = part.match(/^type\s+/);
    if (typeMatch) {
      typeOnly = true;
      part = part.slice(typeMatch[0].length).trim();
    }
    // `name as alias` or just `name`.
    const asMatch = part.match(/^(\S+)\s+as\s+(\S+)$/);
    if (asMatch) {
      const local = asMatch[1]!;
      const exported = asMatch[2]!;
      out.push({ local, exported, typeOnly });
    } else if (/^\S+$/.test(part)) {
      out.push({ local: part, exported: part, typeOnly });
    }
  }
  return out;
}
