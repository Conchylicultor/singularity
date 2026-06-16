// One run of snippet text, flagged as a highlighted match (a `<mark>…</mark>`
// span produced server-side by ts_headline) or plain surrounding text.
export interface SnippetSegment {
  text: string;
  highlight: boolean;
}

// Split a server snippet into structured segments at `<mark>…</mark>` boundaries.
// Rendering these as React nodes (rather than dangerouslySetInnerHTML) keeps the
// untrusted snippet body out of the HTML parser entirely. Only the literal
// `<mark>`/`</mark>` markers ts_headline emits are interpreted; everything else
// is treated as plain text.
export function parseHighlightedSnippet(snippet: string): SnippetSegment[] {
  const segments: SnippetSegment[] = [];
  const re = /<mark>(.*?)<\/mark>/gs;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(snippet)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: snippet.slice(lastIndex, match.index), highlight: false });
    }
    segments.push({ text: match[1] ?? "", highlight: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < snippet.length) {
    segments.push({ text: snippet.slice(lastIndex), highlight: false });
  }
  return segments;
}
