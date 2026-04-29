import type { EditedFileStatus } from "../../shared/protocol";

export interface NameStatusRecord {
  status: EditedFileStatus;
  path: string;
  from?: string;
}

export interface NumstatRecord {
  additions: number;
  deletions: number;
  path: string;
  from?: string;
}

// `git diff -z --name-status` emits NUL-separated fields:
//   "<code>\0<path>\0"             for A/M/D/T
//   "<code><score>\0<old>\0<new>\0" for R<score>/C<score>
// We walk forward and consume one or two extra tokens per record based on the
// leading code letter.
export function parseDiffNameStatusZ(out: string): NameStatusRecord[] {
  const tokens = splitNul(out);
  const result: NameStatusRecord[] = [];
  let i = 0;
  while (i < tokens.length) {
    const code = tokens[i]![0]!;
    if (code === "R" || code === "C") {
      const oldPath = tokens[i + 1];
      const newPath = tokens[i + 2];
      if (oldPath === undefined || newPath === undefined) break;
      result.push({
        status: code === "R" ? "renamed" : "copied",
        path: newPath,
        from: oldPath,
      });
      i += 3;
    } else {
      const path = tokens[i + 1];
      if (path === undefined) break;
      result.push({ status: mapSimpleStatus(code), path });
      i += 2;
    }
  }
  return result;
}

// `git diff -z --numstat` emits
//   "<add>\t<del>\t<path>\0"            for unchanged paths
//   "<add>\t<del>\t\0<old>\0<new>\0"    for renames/copies (path field empty)
export function parseDiffNumstatZ(out: string): NumstatRecord[] {
  const tokens = splitNul(out);
  const result: NumstatRecord[] = [];
  let i = 0;
  while (i < tokens.length) {
    const head = tokens[i]!;
    const parts = head.split("\t");
    if (parts.length < 3) {
      i++;
      continue;
    }
    const add = toCount(parts[0]!);
    const del = toCount(parts[1]!);
    const path = parts[2]!;
    if (path === "") {
      const oldPath = tokens[i + 1];
      const newPath = tokens[i + 2];
      if (oldPath === undefined || newPath === undefined) break;
      result.push({ additions: add, deletions: del, path: newPath, from: oldPath });
      i += 3;
    } else {
      result.push({ additions: add, deletions: del, path });
      i += 1;
    }
  }
  return result;
}

function splitNul(out: string): string[] {
  const tokens = out.split("\0");
  if (tokens.length > 0 && tokens[tokens.length - 1] === "") tokens.pop();
  return tokens;
}

function toCount(s: string): number {
  // "-" means binary; treat as 0.
  if (s === "-") return 0;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function mapSimpleStatus(code: string): EditedFileStatus {
  if (code === "A") return "added";
  if (code === "D") return "deleted";
  return "modified";
}
