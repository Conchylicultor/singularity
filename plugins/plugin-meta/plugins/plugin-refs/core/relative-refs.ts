import { assertRange, hasGlob, lineIndex } from "./resolve";
import type { RelativeRef, RelativeRefSyntax } from "./types";

/** Blank `[from, to)` of `chars`, keeping newlines so offsets and lines hold. */
function blank(chars: string[], from: number, to: number): void {
  for (let i = from; i < to; i++) if (chars[i] !== "\n") chars[i] = " ";
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * A copy of markdown `src` of identical length with everything that is not
 * prose blanked: fenced code blocks, inline code spans and HTML comments. A
 * link written there is an example, not a link.
 */
export function maskMarkdown(src: string): string {
  const chars = src.split("");
  // Fenced code blocks: a closing fence is the same char, at least as long.
  let offset = 0;
  let fence: { ch: string; len: number; from: number } | null = null;
  for (const line of src.split("\n")) {
    const m = FENCE_RE.exec(line);
    if (fence) {
      if (
        m &&
        m[1]![0] === fence.ch &&
        m[1]!.length >= fence.len &&
        line.slice(m[0].length).trim() === ""
      ) {
        blank(chars, fence.from, offset + line.length);
        fence = null;
      }
    } else if (m) {
      fence = { ch: m[1]![0]!, len: m[1]!.length, from: offset };
    }
    offset += line.length + 1;
  }
  // An unclosed fence runs to the end of the document (CommonMark).
  if (fence) blank(chars, fence.from, src.length);

  let text = chars.join("");
  // HTML comments.
  for (const m of text.matchAll(/<!--[\s\S]*?-->/g)) {
    blank(chars, m.index, m.index + m[0].length);
  }
  text = chars.join("");
  // Inline code: a run of N backticks closes at the next run of exactly N,
  // within one paragraph (no blank line in between).
  for (let i = 0; i < text.length;) {
    if (text[i] !== "`") {
      i++;
      continue;
    }
    let n = 0;
    while (text[i + n] === "`") n++;
    const run = "`".repeat(n);
    let j = i + n;
    let close = -1;
    while ((j = text.indexOf(run, j)) >= 0) {
      if (text[j + n] === "`" || text[j - 1] === "`") {
        while (text[j] === "`") j++;
        continue;
      }
      close = j;
      break;
    }
    if (close < 0 || text.slice(i, close).includes("\n\n")) {
      i += n;
      continue;
    }
    blank(chars, i, close + n);
    i = close + n;
  }
  return chars.join("");
}

/** True for a target that is a URL or otherwise not a relative repo path. */
function isNonRelative(target: string): boolean {
  return (
    target === "" ||
    target.startsWith("#") ||
    target.startsWith("/") ||
    target.startsWith("~") ||
    /^[a-z][a-z0-9+.-]*:/i.test(target)
  );
}

/** The path part of a link target: everything before `#` / `?`. */
function pathPart(target: string): string {
  const cut = target.search(/[#?]/);
  return cut < 0 ? target : target.slice(0, cut);
}

/**
 * Read an inline link destination starting at `i` (just after `](`): either
 * `<…>` or a run with balanced parentheses ending at whitespace or the
 * unbalanced `)`. Returns the destination's offset and text.
 */
function readDestination(
  text: string,
  i: number,
): { start: number; value: string } | null {
  while (text[i] === " " || text[i] === "\t") i++;
  if (text[i] === "<") {
    const end = text.indexOf(">", i + 1);
    if (end < 0 || text.slice(i + 1, end).includes("\n")) return null;
    return { start: i + 1, value: text.slice(i + 1, end) };
  }
  let depth = 0;
  let j = i;
  for (; j < text.length; j++) {
    const c = text[j]!;
    if (/\s/.test(c)) break;
    if (c === "\\") {
      j++;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      if (depth === 0) break;
      depth--;
    }
  }
  return { start: i, value: text.slice(i, j) };
}

/**
 * Relative targets in one markdown source: `[x](rel)` / `![x](rel)`,
 * `[x]: rel` definitions, and `<img src>` / `<a href>` attributes. URLs,
 * absolute paths, pure anchors and anything inside code or an HTML comment are
 * skipped. The range spans the path, without its `#anchor` / `?query`.
 */
export function scanMarkdownRefs(file: string, src: string): RelativeRef[] {
  const text = maskMarkdown(src);
  const lineOf = lineIndex(src);
  const out: RelativeRef[] = [];
  const push = (syntax: RelativeRefSyntax, start: number, target: string) => {
    if (isNonRelative(target)) return;
    const value = pathPart(target);
    if (value === "") return;
    const range = { start, end: start + value.length };
    assertRange(file, src, range, value);
    out.push({
      kind: "relative",
      syntax,
      file,
      range,
      line: lineOf(start),
      value,
      glob: false,
    });
  };

  for (const m of text.matchAll(/\]\(/g)) {
    const dest = readDestination(text, m.index + 2);
    if (dest) push("md-link", dest.start, dest.value);
  }
  for (const m of text.matchAll(
    /^ {0,3}\[([^\]\n^][^\]\n]*)\]:[ \t]*(<[^>\n]*>|\S+)/gm,
  )) {
    const raw = m[2]!;
    const angled = raw.startsWith("<");
    const start = m.index + m[0].length - raw.length + (angled ? 1 : 0);
    push("md-definition", start, angled ? raw.slice(1, -1) : raw);
  }
  for (const m of text.matchAll(
    /<(?:img|a|source)\b[^>]*?\s(?:src|href)\s*=\s*(["'])([^"'\n]*)\1/gi,
  )) {
    const value = m[2]!;
    push("html-attr", m.index + m[0].length - 1 - value.length, value);
  }
  return out;
}

/**
 * A copy of CSS `src` of identical length with comments blanked. Strings are
 * skipped whole, so a glob like `"../**\/*.tsx"` (whose `/*` … `*\/` looks like
 * a comment) is left alone.
 */
function maskCssComments(src: string): string {
  const chars = src.split("");
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (c === '"' || c === "'") {
      i++;
      while (i < src.length && src[i] !== c && src[i] !== "\n") {
        if (src[i] === "\\") i++;
        i++;
      }
    } else if (c === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      blank(chars, i, stop);
      i = stop - 1;
    }
  }
  return chars.join("");
}

/**
 * Relative paths in one CSS source: `@source "rel"` (and `@source not "rel"`)
 * and `@import "rel"`. A bare package import (`@import "tailwindcss"`) is not
 * relative and is skipped; comments are ignored.
 */
export function scanCssRefs(file: string, src: string): RelativeRef[] {
  const text = maskCssComments(src);
  const lineOf = lineIndex(src);
  const out: RelativeRef[] = [];
  for (const m of text.matchAll(
    /@(source|import)\s+(?:not\s+)?(["'])([^"'\n]*)\2/g,
  )) {
    const value = m[3]!;
    if (!value.startsWith("./") && !value.startsWith("../")) continue;
    const start = m.index + m[0].length - 1 - value.length;
    const range = { start, end: start + value.length };
    assertRange(file, src, range, value);
    out.push({
      kind: "relative",
      syntax: m[1] === "source" ? "css-source" : "css-import",
      file,
      range,
      line: lineOf(start),
      value,
      glob: hasGlob(value),
    });
  }
  return out;
}
