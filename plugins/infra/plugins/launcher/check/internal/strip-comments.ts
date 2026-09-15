import ts from "typescript";

// Blank out the comments of a source file, so a scan over what is left sees
// only code: identifiers, string literals and template text survive, prose
// does not. The result has the SAME length and the same newlines as the input,
// so a line number found in it is the line number in the original file.
//
// Three syntaxes, chosen by path, because `launcher:runtime-env-declared` scans
// TypeScript, the gateway's Go, the desktop shell's Rust and the git hooks.
// Anything else throws: a file this cannot read correctly must not be scanned
// as if it had no comments.

/** Replace every character in [start, end) with a space, except newlines. */
function blank(out: string[], start: number, end: number): void {
  for (let i = start; i < end; i++) if (out[i] !== "\n") out[i] = " ";
}

/**
 * TypeScript: the comments come from the PARSED file, not from a bare
 * `ts.createScanner` loop. A scanner has no parser context, so it reads a regex
 * literal as a division and desyncs, after which a `//` inside a string reads
 * as a comment (the format plugin's directive-displacement.ts hit exactly
 * that).
 *
 * Every comment sits in the trivia before some leaf token, so visiting every
 * leaf covers them all, including a comment in an empty block (trivia of `}`)
 * and one at end of file (trivia of the end-of-file token). Each trivia run is
 * read twice: `getTrailingCommentRanges` stops at the run's first line break
 * and `getLeadingCommentRanges` starts after it, so a comment on the same line
 * as the token before it is only in the trailing half.
 */
function stripTypeScript(path: string, src: string): string {
  const sf = ts.createSourceFile(
    path,
    src,
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out = src.split("");
  const visit = (node: ts.Node): void => {
    // A JSDoc block is attached to the declaration after it as child nodes,
    // with tokens INSIDE the comment. Blank it whole instead of descending, so
    // no trivia scan ever starts from a position inside a comment.
    if (ts.isJSDoc(node)) {
      blank(out, node.getStart(sf), node.getEnd());
      return;
    }
    const children = node.getChildren(sf);
    if (children.length > 0) {
      for (const child of children) visit(child);
      return;
    }
    const pos = node.getFullStart();
    for (const range of [
      ...(ts.getTrailingCommentRanges(src, pos) ?? []),
      ...(ts.getLeadingCommentRanges(src, pos) ?? []),
    ]) {
      blank(out, range.pos, range.end);
    }
  };
  visit(sf);
  return out.join("");
}

// A Go rune or Rust char literal: `'x'`, `'\''`, `'\u{1F600}'`. Anything else
// starting with `'` (a Rust lifetime, `'a`) is left as code.
const CHAR_LITERAL_RE = /^'(?:\\.[^'\n]*?|[^\\'\n])'/;

/**
 * Go and Rust: `//` to end of line and `/* … *\/` blocks, skipping over
 * double-quoted strings (with backslash escapes), Go raw backtick strings and
 * char literals, so a `//` inside `"http://…"` stays code. Not handled: Rust
 * raw strings (`r#"…"#`) and nested Rust block comments; neither occurs in the
 * files scanned.
 */
function stripCLike(src: string): string {
  const out = src.split("");
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      blank(out, i, stop);
      i = stop;
    } else if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      blank(out, i, stop);
      i = stop;
    } else if (c === '"') {
      i++;
      while (i < src.length && src[i] !== '"' && src[i] !== "\n") {
        i += src[i] === "\\" ? 2 : 1;
      }
      i++;
    } else if (c === "`") {
      const end = src.indexOf("`", i + 1);
      i = end === -1 ? src.length : end + 1;
    } else if (c === "'") {
      const rune = CHAR_LITERAL_RE.exec(src.slice(i, i + 16));
      i += rune ? rune[0].length : 1;
    } else {
      i++;
    }
  }
  return out.join("");
}

/**
 * Shell: `#` starts a comment only at the start of a word (line start or after
 * whitespace), so `$#` and `${#var}` stay code, and never inside single or
 * double quotes.
 */
function stripShell(src: string): string {
  const out = src.split("");
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === "#" && (i === 0 || /\s/.test(src[i - 1]!))) {
      const end = src.indexOf("\n", i);
      const stop = end === -1 ? src.length : end;
      blank(out, i, stop);
      i = stop;
    } else if (c === "'") {
      const end = src.indexOf("'", i + 1);
      i = end === -1 ? src.length : end + 1;
    } else if (c === '"') {
      i++;
      while (i < src.length && src[i] !== '"') i += src[i] === "\\" ? 2 : 1;
      i++;
    } else if (c === "\\") {
      i += 2;
    } else {
      i++;
    }
  }
  return out.join("");
}

/**
 * `src` with its comments blanked, read with the syntax `path` implies.
 * Throws for a path whose comment syntax this does not know.
 */
export function stripComments(path: string, src: string): string {
  if (path.endsWith(".ts") || path.endsWith(".tsx")) {
    return stripTypeScript(path, src);
  }
  if (path.endsWith(".go") || path.endsWith(".rs")) return stripCLike(src);
  if (path.startsWith(".githooks/")) return stripShell(src);
  throw new Error(
    `stripComments: no comment syntax known for ${path} — add one before scanning this kind of file`,
  );
}
