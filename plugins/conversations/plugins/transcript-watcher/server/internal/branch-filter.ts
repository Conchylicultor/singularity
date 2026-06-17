// Claude Code transcripts are a forest, not a flat log. Every line carries a
// `uuid` and a `parentUuid`. Three things branch the tree:
//
//   - **Rewind / edit-last-turn.** When the user rewinds and resubmits, Claude
//     appends a *new* branch off an earlier node and leaves the abandoned
//     attempt in the file. Both branches share a common ancestor.
//   - **Resume / restart.** A resumed session appends a fresh root tree
//     (`parentUuid: null`) to the same file — a disjoint segment.
//   - **Compaction.** A compact boundary re-roots the post-compaction turns as
//     a new tree; the pre-compaction history stays as its own tree.
//
// Rendering lines in raw file order therefore shows abandoned rewind branches
// as duplicate, contradictory content next to the path the user actually kept.
//
// `activeLineUuids` returns the set of line uuids that belong to the live
// conversation: for **every** root tree, the path from that tree's most-recent
// leaf back to its root. This keeps all resume/compaction segments intact
// (each contributes its own active path) while dropping only the abandoned
// rewind branches *within* a tree. Lines without a uuid (metadata markers like
// `permission-mode` / `ai-title`) are not part of the tree; the caller keeps
// them untouched.

interface TreeLine {
  uuid?: unknown;
  parentUuid?: unknown;
}

export function activeLineUuids(lines: readonly TreeLine[]): Set<string> {
  // Index every uuid-bearing line by its file-order position. File order is
  // append order, so the highest index in a tree is its most-recent leaf.
  const byUuid = new Map<string, { parentUuid: string | null; index: number }>();
  lines.forEach((line, index) => {
    const uuid = typeof line.uuid === "string" ? line.uuid : null;
    if (!uuid) return;
    const parentUuid = typeof line.parentUuid === "string" ? line.parentUuid : null;
    byUuid.set(uuid, { parentUuid, index });
  });
  if (byUuid.size === 0) return new Set();

  // Resolve each node to its tree root. A root is a node whose parent is null or
  // dangling (a ref to a uuid not present in this file — e.g. a prior
  // transcript). Memoized across calls; the local seen-set guards against a
  // malformed cyclic chain so this can never loop forever.
  const rootOf = new Map<string, string>();
  const findRoot = (start: string): string => {
    const seen: string[] = [];
    let cur = start;
    let root = start;
    for (;;) {
      const cached = rootOf.get(cur);
      if (cached) {
        root = cached;
        break;
      }
      if (seen.includes(cur)) {
        root = cur; // cycle guard — treat the entry node as the root
        break;
      }
      seen.push(cur);
      const parent = byUuid.get(cur)?.parentUuid ?? null;
      if (!parent || !byUuid.has(parent)) {
        root = cur;
        break;
      }
      cur = parent;
    }
    for (const u of seen) rootOf.set(u, root);
    return root;
  };

  // For each root, pick the active leaf = the member with the highest file index.
  const leafOfRoot = new Map<string, { uuid: string; index: number }>();
  for (const [uuid, node] of byUuid) {
    const root = findRoot(uuid);
    const best = leafOfRoot.get(root);
    if (!best || node.index > best.index) leafOfRoot.set(root, { uuid, index: node.index });
  }

  // Keep the leaf→root path of every tree.
  const kept = new Set<string>();
  for (const { uuid } of leafOfRoot.values()) {
    let cur: string | null = uuid;
    while (cur && !kept.has(cur)) {
      kept.add(cur);
      const parent: string | null = byUuid.get(cur)?.parentUuid ?? null;
      cur = parent && byUuid.has(parent) ? parent : null;
    }
  }
  return kept;
}
