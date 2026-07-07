// ============================================================================
// Shared parse helpers for the plugin-boundaries check.
//
// Tokenizer-based (no TypeScript compiler API). splitTopLevelStatements takes
// RAW source and is string-safe: boundary detection (brace/paren/bracket depth,
// `;`-at-depth-0, brace-close-then-newline) runs over a FULLY masked copy
// (comments + regex + string interiors blanked) so braces/semicolons inside a
// string or template literal can never mis-count depth or mis-split; the
// returned statement `text` is sliced — at the SAME offsets — from a copy where
// comments/regex are masked but STRING INTERIORS ARE KEPT, so downstream
// extractFromSpecifier/parseBindingList still see real module specifiers.
// extractFromSpecifier pulls a trailing `from "<mod>"`; parseBindingList parses
// an ESM binding clause.
// ============================================================================

import { maskSource } from "@plugins/plugin-meta/plugins/parse-utils/core";

export interface TopLevelStmt {
  text: string;
  line: number;
}

/** Half-open offset range into the masked/forText buffers, with its start line. */
interface StmtRange {
  start: number;
  end: number;
  line: number;
}

/**
 * Split raw `src` into top-level statements, string-safely.
 *
 * Statements are delimited by `;` or by newlines where the previous line is
 * statement-complete AND current depth is 0. For simplicity we treat each
 * semicolon-or-EOF segment at brace/paren/bracket depth 0 as one statement.
 *
 * All boundary detection runs over `masked` (a FULL mask — comments, regex, and
 * string interiors blanked) so a brace/semicolon inside a string or template
 * literal cannot mis-count depth or mis-split. Each statement's text is sliced
 * at the same offsets from `forText` (comments masked, string interiors kept) —
 * both masks are the same length as `src`, so offsets align 1:1.
 */
export function splitTopLevelStatements(src: string): TopLevelStmt[] {
  const masked = maskSource(src); // full mask → boundary detection
  const forText = maskSource(src, { strings: false }); // strings kept → text slicing
  const out: TopLevelStmt[] = [];
  for (const seg of splitByTopLevelSemicolon(masked)) {
    // Also split on top-level newlines where the preceding statement form is
    // complete — specifically, `}` followed by a newline at depth 0 terminates
    // things like `interface X { ... }` and `export default { ... }`. Our
    // semicolon-based split already handles most real cases (TS code uses
    // semicolons or follows ASI conventions where barrels do); the added
    // robustness below catches brace-closed declarations lacking a trailing `;`.
    for (const r of splitByTopLevelBraceClose(masked, forText, seg)) {
      out.push({ text: forText.slice(r.start, r.end), line: r.line });
    }
  }
  return out;
}

/** Phase 1: split the whole masked buffer on `;` at brace/paren/bracket depth 0. */
function splitByTopLevelSemicolon(masked: string): StmtRange[] {
  const out: StmtRange[] = [];
  let depth = 0;
  let start = 0;
  let line = 1;
  let stmtLine = 1;
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i]!;
    if (c === "\n") line++;
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") depth = Math.max(0, depth - 1);
    else if (c === ";" && depth === 0) {
      out.push({ start, end: i, line: stmtLine });
      start = i + 1;
      stmtLine = line;
    }
  }
  if (start < masked.length) out.push({ start, end: masked.length, line: stmtLine });
  return out;
}

/**
 * Phase 2: within one segment range, further split on a depth-0 `}` immediately
 * followed (over the rest of the line) by a newline or EOF. Boundaries scan
 * `masked`; the trailing-segment emptiness check reads `forText` (the real text).
 */
function splitByTopLevelBraceClose(
  masked: string,
  forText: string,
  seg: StmtRange,
): StmtRange[] {
  const out: StmtRange[] = [];
  let depth = 0;
  let start = seg.start;
  let line = seg.line;
  let stmtLine = seg.line;
  for (let i = seg.start; i < seg.end; i++) {
    const c = masked[i]!;
    if (c === "\n") line++;
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && c === "}") {
        // Look ahead: if next non-whitespace char ends the segment with a newline
        // before any further syntactically meaningful token, split here.
        let j = i + 1;
        while (j < seg.end && masked[j] !== "\n" && /\s/.test(masked[j]!)) j++;
        if (j >= seg.end || masked[j] === "\n") {
          out.push({ start, end: i + 1, line: stmtLine });
          start = i + 1;
          stmtLine = line + (masked[j] === "\n" ? 1 : 0);
          i = j;
          if (masked[j] === "\n") line++;
        }
      }
    }
  }
  if (start < seg.end) {
    const tail = forText.slice(start, seg.end);
    if (tail.trim()) out.push({ start, end: seg.end, line: stmtLine });
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
