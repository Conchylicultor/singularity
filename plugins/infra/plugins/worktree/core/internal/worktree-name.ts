// Canonical worktree-id shape (attempt id == fork DB name == registry entry
// name): `att-<epoch>-<suffix>` / `claude-<epoch>-<suffix>`, plus the legacy
// suffix-less `claude-<epoch>` form still present in the registry. The single
// `-[a-z0-9]+` suffix group (no extra dashes) excludes the per-build data files
// that share the registry dir (`<name>-build-profile.json`,
// `<name>-build-logs-<id>.json`), the reserved `singularity`/`central`
// namespaces, composition ids and `*__forking` temps.
//
// One source of truth for everything that has to tell a worktree checkout's
// name apart from another name on the same axis: worktree cleanup's fork-DB,
// registry-file and on-disk dir scans, its delete handlers' id validation, and
// the backup's database selection.
//
// DO NOT WIDEN IT TO ADMIT DOTTED NAMES: a composition's checkout namespace
// (`sonata.att-X`) is a different kind of thing, reclaimed by its marker (see
// `worktree/reclaim`), not by worktree cleanup.
export const WORKTREE_NAME_RE = /^(att|claude)-\d+(-[a-z0-9]+)?$/;

export function isCanonicalWorktreeName(name: string): boolean {
  return WORKTREE_NAME_RE.test(name);
}
