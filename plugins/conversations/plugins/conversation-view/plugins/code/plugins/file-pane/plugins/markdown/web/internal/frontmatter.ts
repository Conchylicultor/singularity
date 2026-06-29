export interface FrontmatterField {
  key: string;
  value: string;
}

export interface SplitContent {
  fields: FrontmatterField[];
  body: string;
}

/**
 * Splits a leading YAML frontmatter block (`---` … `---` at the very top of the
 * file) from the markdown body. Returns `null` when the content has no
 * frontmatter, or when the fence is present but holds no parseable `key:` line —
 * in both cases the caller renders the raw content unchanged.
 *
 * This is a DISPLAY parser, not a YAML implementation: the metadata card shows
 * every value as text, so nested structures and list items collapse to a
 * comma-joined string. That keeps us off the hand-rolled-YAML footgun while
 * covering the flat `key: value` frontmatter these files actually use.
 */
export function splitFrontmatter(content: string): SplitContent | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/.exec(content);
  if (!match) return null;
  const fields = parseFields(match[1] ?? "");
  if (fields.length === 0) return null;
  return { fields, body: content.slice(match[0].length) };
}

// YAML block-scalar header in the value position: `>` / `|` with optional
// chomping (`+`/`-`) and indentation (digit) indicators, e.g. `>`, `|-`, `>2`.
const BLOCK_SCALAR = /^[|>][+\-0-9]*$/;

function parseFields(block: string): FrontmatterField[] {
  const fields: FrontmatterField[] = [];
  // How the *current* field's continuation lines fold: block scalars (`>`/`|`)
  // join their wrapped lines with a space; lists / wrapped values join with `, `.
  let folded = false;
  for (const raw of block.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const top = /^([A-Za-z0-9_.-]+):[ \t]*(.*)$/.exec(raw);
    if (top && !/^[ \t]/.test(raw)) {
      const rawValue = (top[2] ?? "").trim();
      folded = BLOCK_SCALAR.test(rawValue);
      // A block-scalar header carries no inline value — the text follows on the
      // indented lines below, so it must not leak `>`/`|` into the rendered value.
      fields.push({ key: top[1] ?? "", value: folded ? "" : unquote(rawValue) });
      continue;
    }
    // Indented continuation / list item — fold into the previous value.
    const last = fields[fields.length - 1];
    if (!last) continue;
    // Strip leading dashes only for list items; in a block scalar a leading `-`
    // is literal content, so trim whitespace alone there.
    const cont = unquote(raw.replace(folded ? /^[ \t]+/ : /^[ \t-]+/, ""));
    if (!cont) continue;
    last.value = last.value ? `${last.value}${folded ? " " : ", "}${cont}` : cont;
  }
  return fields;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
