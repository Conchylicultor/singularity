// Which files plugin-boundaries parses for the import-grammar rules (R4–R10).
//
// The set is SELECTED from `listRepoFiles`'s one git-backed enumeration, never
// walked. That is not a convenience: this check is `inputKeyed`, and its
// read-set records membership as `view.glob("plugins/**")` over the git tree
// snapshot (`./read-set`). A filesystem walk answers a different question — it
// also sees gitignored files, which the snapshot and the cache key do not cover
// — so a stray `.ts` under a gitignored directory inside `plugins/` would be
// scanned for violations while being invisible to the key that records the
// resulting PASS. Selecting from the same git-derived set makes the scanned set
// and the recorded fact agree by construction.
// See research/2026-09-09-tooling-check-file-enumeration-from-git.md.

// The directory under which a file is boundary-relevant. The SPA composition
// root (`plugins/framework/plugins/web-core/web`) sits inside it, so one root
// covers it; selecting from a single root also means no file can be yielded
// twice, as the old two-rooted walk could.
const SOURCE_ROOT = "plugins/";

function underSourceRoot(path: string): boolean {
  return path.startsWith(SOURCE_ROOT);
}

/**
 * The `.ts`/`.tsx` sources under the boundary source roots, repo-relative and
 * in the order `allFiles` supplies (sorted, from `listRepoFiles`).
 *
 * `allFiles` must be the whole repo-relevant set — pass `listRepoFiles(root)`
 * straight in. Gitignored paths (`node_modules/`, `dist/`, every `dist.*`
 * variant, `.cache/`, …) are already absent from it, which is why this carries
 * no deny-list of its own: a hand-maintained one could only drift from the
 * `.gitignore` that actually decides what the cache key covers.
 */
export function selectSourceFiles(allFiles: readonly string[]): string[] {
  return allFiles.filter(
    (p) => (p.endsWith(".ts") || p.endsWith(".tsx")) && underSourceRoot(p),
  );
}
