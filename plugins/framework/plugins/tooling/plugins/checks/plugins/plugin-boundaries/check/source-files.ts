// Which files plugin-boundaries parses for the import-grammar rules (R4–R12).
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

// The prefixes under which a file is boundary-relevant. The second is nested
// inside the first (`plugins/framework/plugins/web-core/web`) and so adds
// nothing today; it is kept because it states the intent — the SPA composition
// root is in scope — independently of where that root currently sits. Selecting
// from a deduped list means the overlap can no longer yield the same file twice,
// as the two-rooted walk did.
const SOURCE_ROOTS = ["plugins", "plugins/framework/plugins/web-core/web"];

function underSourceRoot(path: string): boolean {
  return SOURCE_ROOTS.some((r) => path === r || path.startsWith(r + "/"));
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
