// Scalar primitives the ops share, each written to answer exactly as the
// cluster does: it is `C`-collated (`datcollate` / `datctype` = C), so text
// orders by code point and `lower()` / `ILIKE` fold ASCII letters only. The
// parity suite pins both facts against a real Postgres.

/** A normalized scalar: a string, a finite number (instants are epoch ms), or a boolean. */
export type FilterScalar = string | number | boolean;

/**
 * Total order over two scalars of the same type, matching Postgres on a `C`
 * collation cluster: numbers numerically, booleans false < true, strings by
 * Unicode code point (UTF-8 byte order). Throws on a type mismatch — comparing
 * a row's number against a string operand is a declaration bug, and answering
 * `false` would hide it as "no rows match".
 */
export function compareScalars(a: FilterScalar, b: FilterScalar): number {
  if (typeof a !== typeof b) {
    throw new Error(
      `filter: cannot compare a ${typeof a} value with a ${typeof b} operand ` +
        `(${JSON.stringify(a)} vs ${JSON.stringify(b)})`,
    );
  }
  if (typeof a === "string") return compareCodePoints(a, b as string);
  if (typeof a === "number") {
    const n = b as number;
    return a < n ? -1 : a > n ? 1 : 0;
  }
  return Number(a) - Number(b as boolean);
}

// JS `<` compares UTF-16 code units, which disagrees with code-point order only
// where a surrogate (U+D800–DFFF, i.e. a code point ≥ U+10000) meets a unit in
// U+E000–FFFF. Remap that one range at the first differing unit.
function compareCodePoints(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    if (x !== y) return codePointRank(x) - codePointRank(y);
  }
  return a.length - b.length;
}

function codePointRank(unit: number): number {
  if (unit < 0xd800) return unit;
  return unit >= 0xe000 ? unit - 0x800 : unit + 0x2000;
}

/**
 * `lower()` on a `C` ctype: A–Z only. JS `toLowerCase` folds `É` → `é` (and
 * `İ` into two code units); Postgres here does not, so neither may we.
 */
export function asciiLower(s: string): string {
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

/**
 * The characters the `C` locale's `[[:space:]]` class holds — and the ones the
 * text domain's SQL emptiness pattern spells out literally. JS `trim()` also
 * strips U+00A0, U+2028, U+FEFF …, which Postgres keeps as content.
 */
export const ASCII_SPACE = " \t\n\v\f\r";

const WHITESPACE_ONLY = new RegExp(`^[${ASCII_SPACE}]*$`);

export function isAsciiBlank(s: string): boolean {
  return WHITESPACE_ONLY.test(s);
}

/**
 * The `ILIKE` pattern that matches `needle` as a literal substring. Postgres'
 * default LIKE escape character is the backslash, so `\`, `%` and `_` are
 * escaped with it.
 */
export function containsPattern(needle: string): string {
  return `%${needle.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}
