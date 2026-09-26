import { matchBracket } from "@plugins/plugin-meta/plugins/parse-utils/core";

export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * Blank out the interior of every `@theme { … }` / `@theme inline { … }` block
 * (replaced by spaces, length preserved) so `--x:` declarations inside them are
 * not seen as ambiguous same-level runtime declarations. Brace matching reuses
 * `matchBracket` (skips comments/strings).
 */
export function maskThemeBlocks(src: string): string {
  let out = src;
  const re = /@theme\b[^{]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(out))) {
    const braceStart = out.indexOf("{", m.index);
    if (braceStart < 0) break;
    const braceEnd = matchBracket(out, braceStart, "{", "}");
    if (braceEnd < 0) break;
    out =
      out.slice(0, braceStart + 1) +
      " ".repeat(braceEnd - braceStart - 1) +
      out.slice(braceEnd);
    re.lastIndex = braceEnd;
  }
  return out;
}

/**
 * Blank out the interior of every `style( … )` container-query condition
 * (length preserved). `@container style(--x: custom)` tests the var's inherited
 * value — a read, like `var(--x)` — though it is spelled `--x:` like a
 * declaration. `style(` is CSS's container style-query function and nothing
 * else, so masking every occurrence masks exactly the conditions.
 */
export function maskStyleQueries(src: string): string {
  let out = src;
  const re = /\bstyle\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(out))) {
    const parenStart = m.index + m[0].length - 1;
    const parenEnd = matchBracket(out, parenStart, "(", ")");
    if (parenEnd < 0) break;
    out =
      out.slice(0, parenStart + 1) +
      " ".repeat(parenEnd - parenStart - 1) +
      out.slice(parenEnd);
    re.lastIndex = parenEnd;
  }
  return out;
}

/** The CSS with everything that spells `--x:` without declaring `--x` blanked out. */
export function maskNonDeclarations(src: string): string {
  return maskStyleQueries(maskThemeBlocks(stripComments(src)));
}
