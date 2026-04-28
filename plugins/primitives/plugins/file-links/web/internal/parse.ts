// Matches file paths with at least one directory separator, e.g.
// research/2026-04-26-foo.md, docs/plugins.md, ~/.singularity/worktrees/central.json
export const FILE_PATH_RE =
  /(?<![\w./~-])((?:~\/)?(?:[\w.\-]+\/)+[\w.\-]+\.(?:md|mdx|ts|tsx|js|jsx|py|go|yaml|yml|json|txt))(?![\w/-])/g;

export interface FileLinkSegment {
  type: "text" | "path";
  value: string;
}

export function parseFileLinks(text: string): FileLinkSegment[] {
  const segments: FileLinkSegment[] = [];
  let lastIndex = 0;
  FILE_PATH_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FILE_PATH_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "path", value: match[1] ?? "" });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments;
}
