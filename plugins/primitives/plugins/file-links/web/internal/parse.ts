// Matches file paths with at least one directory separator, e.g.
// research/2026-04-26-foo.md, docs/plugins.md, ~/.singularity/worktrees/central.json, ~/.zshrc
// Two path shapes:
//   ~/[dirs/]file  — home-rooted; zero or more extra dir segments after ~/
//   [~/]dirs/file  — relative or home-rooted with at least one dir segment
// Final segment must either contain a dot (xx.yy, .zshrc, .tmux.conf) or be a
// well-known extensionless name (Makefile, Dockerfile, …).
// The : in the lookbehind prevents matching URL port numbers (e.g. localhost:9000/plugins/...)
export const FILE_PATH_RE =
  /(?<![\w./~:-])((?:~\/(?:[\w.\-]+\/)*|(?:[\w.\-]+\/)+)(?:[\w\-]*(?:\.[\w\-]+)+|Makefile|Dockerfile|Gemfile|Rakefile|Procfile|Brewfile))(?![\w/-])/g;

// Matches http/https URLs; strips trailing sentence punctuation.
export const URL_RE = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g;

export interface FileLinkSegment {
  type: "text" | "path" | "url";
  value: string;
}

type RawMatch = { index: number; end: number; type: "path" | "url"; value: string };

export function parseFileLinks(text: string): FileLinkSegment[] {
  const raw: RawMatch[] = [];

  FILE_PATH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FILE_PATH_RE.exec(text)) !== null) {
    raw.push({ index: m.index, end: m.index + m[0].length, type: "path", value: m[1] ?? "" });
  }

  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    // Strip trailing sentence punctuation that isn't part of the URL.
    const url = m[0].replace(/[.,;:!?]+$/, "");
    raw.push({ index: m.index, end: m.index + url.length, type: "url", value: url });
  }

  raw.sort((a, b) => a.index - b.index);

  const segments: FileLinkSegment[] = [];
  let lastIndex = 0;
  for (const r of raw) {
    if (r.index < lastIndex) continue; // skip overlapping matches
    if (r.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, r.index) });
    }
    segments.push({ type: r.type, value: r.value });
    lastIndex = r.end;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments;
}
