// Tokenizes flat <tag attr="v">body</tag> pairs in plain text. Lowercase tag
// names only, to avoid colliding with HTML-ish markdown (<br>, <details>, …).
// Non-greedy body, no nesting: the first matching </tag> closes the block.
// Unmatched / malformed tags pass through as text segments.

export type ActiveDataSegment =
  | { type: "text"; value: string }
  | {
      type: "tag";
      tag: string;
      attrs: Record<string, string>;
      children: string;
    };

export const ACTIVE_DATA_TAG_RE =
  /<([a-z][a-z0-9-]*)((?:\s+[a-z][\w-]*="[^"]*")*)\s*>([\s\S]*?)<\/\1>/g;

const ATTR_RE = /([a-z][\w-]*)="([^"]*)"/g;

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(raw)) !== null) {
    out[m[1]!] = m[2]!;
  }
  return out;
}

export function parseActiveData(text: string): ActiveDataSegment[] {
  const segments: ActiveDataSegment[] = [];
  let lastIndex = 0;
  ACTIVE_DATA_TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ACTIVE_DATA_TAG_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    segments.push({
      type: "tag",
      tag: match[1]!,
      attrs: parseAttrs(match[2] ?? ""),
      children: match[3] ?? "",
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments;
}
