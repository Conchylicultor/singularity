/**
 * Source masking for build-time scanners.
 *
 * `maskSource` returns a copy of `src` of IDENTICAL length where characters that
 * live inside comments, regex literals and (optionally) string interiors are
 * replaced by spaces. Because every offset and newline is preserved 1:1, a regex
 * match index in the masked text maps back to the original — callers read real
 * string values from the original at the matched offset.
 *
 * This generalizes the inline skip-loop in `matchBracket` and the private
 * `stripComments` in the boundaries checker: every raw-text scanner in the repo
 * should route through this primitive so a marker in a comment/string/regex can
 * never be mistaken for code.
 */

/**
 * Keywords that may be immediately followed by a regex literal even though they
 * end in an identifier char (e.g. `return /x/`, `typeof /x/`). Without this set,
 * the char-level heuristic would mistake the trailing letter for an operand and
 * read the `/` as division.
 */
const REGEX_PRECEDING_KEYWORDS = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "yield",
  "await",
  "case",
  "do",
  "else",
]);

/**
 * Whether a `/` at the current position begins a regex literal (vs division).
 *
 * Standard heuristic: a `/` starts a regex unless the previous significant token
 * produced a value — i.e. an identifier/number, `)`, `]`, `}`, or a preceding
 * string/regex literal. The exception is a small set of keywords that take an
 * expression on their right (`return`, `typeof`, …).
 *
 * `prevSig` is the previous significant token: the sentinel `"value"` after a
 * string/regex literal, a single character otherwise, or "" at the start of
 * input. `prevWord` is the identifier that ended at `prevSig` (or "").
 */
function regexCanStart(prevSig: string, prevWord: string): boolean {
  if (prevSig === "") return true;
  if (prevSig === "value") return false;
  if (prevSig === ")" || prevSig === "]" || prevSig === "}") return false;
  // identifier char or digit → operand, unless it's an expression-leading keyword
  if (/[A-Za-z0-9_$]/.test(prevSig)) return REGEX_PRECEDING_KEYWORDS.has(prevWord);
  return true;
}

export function maskSource(src: string, opts?: { strings?: boolean }): string {
  const maskStrings = opts?.strings ?? true;
  const n = src.length;
  // Mutable char array seeded from the source; we overwrite masked spans in place
  // so untouched characters (and all newlines) stay exactly where they were.
  const out = src.split("");

  const blank = (i: number) => {
    if (src[i] !== "\n") out[i] = " ";
  };

  let i = 0;
  // Last significant (non-whitespace, non-comment) char seen, for regex/divide.
  let prevSig = "";
  // The identifier word that just ended at `prevSig` (for keyword detection).
  let prevWord = "";

  while (i < n) {
    const c = src[i]!;
    const next = src[i + 1];

    // Line comment: blank `//` and everything up to (not including) the newline.
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") {
        blank(i);
        i++;
      }
      continue;
    }

    // Block comment: blank `/* … */` including delimiters; keep interior newlines.
    if (c === "/" && next === "*") {
      blank(i);
      blank(i + 1);
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        blank(i);
        i++;
      }
      if (i < n) {
        blank(i); // '*'
        blank(i + 1); // '/'
        i += 2;
      }
      continue;
    }

    // Regex literal: opaque, blank interior + delimiters. Honors escapes and
    // character classes (a `/` inside `[ … ]` does not end the regex).
    if (c === "/" && regexCanStart(prevSig, prevWord)) {
      blank(i); // opening '/'
      i++;
      let inClass = false;
      while (i < n) {
        const r = src[i]!;
        if (r === "\n") {
          // Unterminated regex (shouldn't happen in valid source) — stop here.
          break;
        }
        if (r === "\\") {
          blank(i);
          blank(i + 1);
          i += 2;
          continue;
        }
        if (r === "[") inClass = true;
        else if (r === "]") inClass = false;
        else if (r === "/" && !inClass) {
          blank(i); // closing '/'
          i++;
          break;
        }
        blank(i);
        i++;
      }
      // Blank flag characters (a-z) following the closing delimiter.
      while (i < n && /[a-z]/.test(src[i]!)) {
        blank(i);
        i++;
      }
      prevSig = "value"; // a regex literal as a whole is a value
      prevWord = "";
      continue;
    }

    // String / template literal.
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      // Keep the opening delimiter verbatim.
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < n) {
          if (maskStrings) {
            blank(i);
            blank(i + 1);
          }
          i += 2;
          continue;
        }
        if (maskStrings) blank(i);
        i++;
      }
      // Keep the closing delimiter verbatim (if present).
      if (i < n) i++;
      prevSig = "value"; // a string literal as a whole is a value
      prevWord = "";
      continue;
    }

    // Ordinary character.
    if (!/\s/.test(c)) {
      prevSig = c;
      // Accumulate identifier words so `regexCanStart` can spot keywords like
      // `return` / `typeof`; reset on any non-identifier char.
      prevWord = /[A-Za-z0-9_$]/.test(c) ? prevWord + c : "";
    }
    i++;
  }

  return out.join("");
}
