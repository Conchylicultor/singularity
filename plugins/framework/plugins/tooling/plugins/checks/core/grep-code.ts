import { join } from "path";
import { maskSource } from "@plugins/plugin-meta/plugins/parse-utils/core";
import { currentScanTree } from "./scan-context";

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

  // The cache key is computed from this tree-ish; scanning it (rather than the
  // working tree) guarantees a recorded PASS reflects the exact bytes hashed —
  // including files that were untracked when the cache entry was written. Null
  // (uncached / non-git run) falls back to the working tree.
  const tree = currentScanTree();
  const candidates = await listCandidates(opts.root, opts.grepArg, opts.fixed ?? false, pathspecs, tree);
  if (candidates.length === 0) return [];

  const blobs = tree ? await readTreeBlobs(opts.root, tree, candidates) : null;

  // Ensure the global flag so the line scan iterates all matches; build a fresh
  // matcher per file so lastIndex never leaks across files.
  const flags = opts.pattern.flags.includes("g") ? opts.pattern.flags : opts.pattern.flags + "g";

  const matches: CodeMatch[] = [];
  for (const rel of candidates) {
    const src = blobs
      ? blobs.get(rel) ?? null
      : await Bun.file(join(opts.root, rel)).text().catch(() => null);
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
  tree: string | null,
): Promise<string[]> {
  // Against a tree: scan exactly its blobs. Without one (uncached fallback):
  // scan the working tree, adding `--untracked` so even an ad-hoc run still
  // sees not-yet-committed files. Paths from a tree-grep are prefixed with
  // `<tree>:`; strip it so callers always get repo-relative paths.
  const args = ["git", "grep", "-l", fixed ? "-F" : "-E"];
  if (!tree) args.push("--untracked");
  args.push(grepArg);
  if (tree) args.push(tree);
  args.push("--", ...pathspecs);

  const proc = Bun.spawn(args, { cwd: root, stdout: "pipe", stderr: "pipe" });
  const stdout = (await new Response(proc.stdout).text()).trim();
  const code = await proc.exited;
  // `git grep` exits 1 with no output when there are no matches — that's success.
  if (code !== 0 && stdout === "") return [];
  if (stdout === "") return [];

  const prefix = tree ? `${tree}:` : "";
  return stdout
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => (prefix && l.startsWith(prefix) ? l.slice(prefix.length) : l));
}

// Read each candidate's content straight from the tree object via a single
// `git cat-file --batch` (one spawn, not one per file). The batch protocol
// frames each object as `<sha> <type> <size>\n<size bytes>\n`, or
// `<spec> missing\n`; outputs come back in request order.
async function readTreeBlobs(root: string, tree: string, paths: string[]): Promise<Map<string, string>> {
  const requests = paths.map((p) => `${tree}:${p}`).join("\n") + "\n";
  const proc = Bun.spawn(["git", "cat-file", "--batch"], {
    cwd: root,
    stdin: Buffer.from(requests),
    stdout: "pipe",
    stderr: "pipe",
  });
  const buf = new Uint8Array(await new Response(proc.stdout).arrayBuffer());
  await proc.exited;

  const decoder = new TextDecoder();
  const out = new Map<string, string>();
  let i = 0;
  for (const p of paths) {
    const nl = buf.indexOf(0x0a, i);
    if (nl < 0) break;
    const header = decoder.decode(buf.subarray(i, nl));
    i = nl + 1;
    if (header.endsWith(" missing")) continue;
    const size = Number.parseInt(header.split(" ")[2] ?? "", 10);
    if (!Number.isFinite(size)) break; // framing desync — stop rather than mis-slice
    out.set(p, decoder.decode(buf.subarray(i, i + size)));
    i += size + 1; // content + trailing newline
  }
  return out;
}
