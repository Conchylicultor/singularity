import { join } from "path";
import { maskSource } from "@plugins/plugin-meta/plugins/parse-utils/core";

export interface CodeMatch {
  /** File path relative to `root` (as reported by `git grep`). */
  path: string;
  /** 1-based line number of the match. */
  line: number;
  /** The ORIGINAL (unmasked) line text, trailing-trimmed. */
  text: string;
}

interface GrepCodeOptions {
  root: string;
  /** Source of truth: run in JS (global) on masked text to find real-code matches. */
  pattern: RegExp;
  /** Narrows candidate files via `git grep -l` (fast pre-filter). */
  grepArg: string;
  /** Pass `-F` (fixed-string) instead of `-E` (extended regexp) to git grep. */
  fixed?: boolean;
  /** Also mask string interiors (default true). */
  maskStrings?: boolean;
  /** Pathspecs scoping the git grep (default ["*.ts", "*.tsx"]). */
  pathspecs?: string[];
}

/**
 * Find real-code matches of `pattern` across the repo, ignoring occurrences that
 * live in comments, strings or regex literals.
 *
 * `git grep -l` narrows the candidate file set fast; each candidate is then read,
 * masked via `maskSource`, and re-scanned with `pattern` so only genuine code
 * matches survive — with accurate line numbers and original line text.
 */
export async function grepCode(opts: GrepCodeOptions): Promise<CodeMatch[]> {
  const pathspecs = opts.pathspecs ?? ["*.ts", "*.tsx"];
  const maskStrings = opts.maskStrings ?? true;

  const candidates = await listCandidates(opts.root, opts.grepArg, opts.fixed ?? false, pathspecs);
  if (candidates.length === 0) return [];

  // Ensure the global flag so the line scan iterates all matches; build a fresh
  // matcher per file so lastIndex never leaks across files.
  const flags = opts.pattern.flags.includes("g") ? opts.pattern.flags : opts.pattern.flags + "g";

  const matches: CodeMatch[] = [];
  for (const rel of candidates) {
    const abs = join(opts.root, rel);
    const src = await Bun.file(abs).text().catch(() => null);
    if (src == null) continue;
    const masked = maskSource(src, { strings: maskStrings });
    const maskedLines = masked.split("\n");
    const origLines = src.split("\n");
    const re = new RegExp(opts.pattern.source, flags);
    for (let l = 0; l < maskedLines.length; l++) {
      re.lastIndex = 0;
      if (re.test(maskedLines[l]!)) {
        matches.push({ path: rel, line: l + 1, text: (origLines[l] ?? "").replace(/\s+$/, "") });
      }
    }
  }
  return matches;
}

async function listCandidates(
  root: string,
  grepArg: string,
  fixed: boolean,
  pathspecs: string[],
): Promise<string[]> {
  const args = ["git", "grep", "-l", fixed ? "-F" : "-E", grepArg, "--", ...pathspecs];
  const proc = Bun.spawn(args, { cwd: root, stdout: "pipe", stderr: "pipe" });
  const stdout = (await new Response(proc.stdout).text()).trim();
  const code = await proc.exited;
  // `git grep` exits 1 with no output when there are no matches — that's success.
  if (code !== 0 && stdout === "") return [];
  if (stdout === "") return [];
  return stdout.split("\n").filter((l) => l.length > 0);
}
