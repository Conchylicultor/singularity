// The two DIRECTORY questions plugin-boundaries asks — "which subdirectories
// does this plugin have?" (R11) and "does this directory hold TypeScript?"
// (R11 + R3's barrel-required) — answered from the same git-backed enumeration
// `./source-files` selects sources from, never from `readdirSync`.
//
// Same reason, same bug: the check is `inputKeyed`, and its read-set records
// membership as `view.glob("plugins/**")` over the git tree snapshot
// (`./read-set`). Asking the filesystem instead lets a gitignored directory
// holding `.ts` files inside a plugin — `dist/`, a nested `.cache/` the
// recursion reached — raise a real `unknown-dir` violation, or demand a barrel,
// from content no commit contains and no cache key covers.
// See research/2026-09-09-tooling-check-file-enumeration-from-git.md.
//
// A directory here is one that CONTAINS at least one git-listed file, rather
// than one that exists on disk. An empty directory, or one holding only
// gitignored files, is therefore invisible — which is the answer both callers
// already wanted: R11 flags an unrecognized directory only when it holds
// TypeScript, and barrel-required asks the same question before demanding a
// barrel.

/** Directory questions over one `listRepoFiles` result. Paths are repo-relative, `/`-separated, never trailing-slashed. */
export type RepoTree = {
  /** The names of `dir`'s direct subdirectories. */
  subdirs(dir: string): ReadonlySet<string>;
  /** Whether `dir` holds a `.ts`/`.tsx` file at any depth. */
  containsTsFiles(dir: string): boolean;
};

const NO_SUBDIRS: ReadonlySet<string> = new Set();

/**
 * Index `allFiles` — the whole repo-relevant set, i.e. `listRepoFiles(root)` —
 * once per run, so each question is a map lookup rather than a rescan.
 */
export function repoTree(allFiles: readonly string[]): RepoTree {
  const children = new Map<string, Set<string>>();
  const withTs = new Set<string>();

  for (const path of allFiles) {
    const isTs = path.endsWith(".ts") || path.endsWith(".tsx");
    const parts = path.split("/");
    // Every ancestor directory of `path`, from the repo root ("") down to the
    // directory holding it. `parts[i]` is that ancestor's own direct child.
    for (let i = 0; i < parts.length; i++) {
      const dir = parts.slice(0, i).join("/");
      if (isTs) withTs.add(dir);
      if (i === parts.length - 1) continue; // the file itself, not a subdir
      let set = children.get(dir);
      if (!set) children.set(dir, (set = new Set()));
      set.add(parts[i]!);
    }
  }

  return {
    subdirs: (dir) => children.get(dir) ?? NO_SUBDIRS,
    containsTsFiles: (dir) => withTs.has(dir),
  };
}
