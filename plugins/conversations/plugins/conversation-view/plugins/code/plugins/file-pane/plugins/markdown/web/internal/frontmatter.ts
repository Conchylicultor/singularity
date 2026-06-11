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

function parseFields(block: string): FrontmatterField[] {
  const fields: FrontmatterField[] = [];
  for (const raw of block.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const top = /^([A-Za-z0-9_.-]+):[ \t]*(.*)$/.exec(raw);
    if (top && !/^[ \t]/.test(raw)) {
      fields.push({ key: top[1] ?? "", value: unquote(top[2] ?? "") });
      continue;
    }
    // Indented continuation / list item — fold into the previous value.
    const last = fields[fields.length - 1];
    if (!last) continue;
    const cont = unquote(raw.replace(/^[ \t-]+/, ""));
    if (!cont) continue;
    last.value = last.value ? `${last.value}, ${cont}` : cont;
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
