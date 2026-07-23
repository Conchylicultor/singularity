import { APP_SCOPE_DIR } from "./scope-format";

/**
 * Resolve the (hierarchyPath, descriptor name) a config file is governed by — the
 * descriptor whose presence keeps the file alive. A scoped file
 * (`<hier>/@app/<id>/<name>.<ext>`) is anchored to its BASE descriptor
 * `<hier>/<name>`, never to the scope dir; a base value/origin/ancestor is
 * anchored directly. Every user- and git-layer file kind reduces to the same base
 * key, so one function backs both the git-layer prune
 * (`pruneOrphanedConfigFiles`, `config-origins-in-sync`) and the user-layer
 * orphan audit — they can't drift.
 *
 * Handled suffixes (all end in `.jsonc`, so longest-first):
 *   - `.origin.jsonc`   — the code/git default snapshot
 *   - `.ancestor.jsonc` — the transient three-way-merge base (user layer only)
 *   - `.jsonc`          — a user/git override
 *
 * Returns null for non-config files (e.g. `config/CLAUDE.md`). Paths are relative
 * to the config dir, forward-slash separated.
 */
export function configFileOwner(relPath: string): { hier: string; name: string } | null {
  const cut = (p: string, suffix: string): { hier: string; name: string } => {
    const base = p.slice(0, p.length - suffix.length);
    const idx = base.lastIndexOf("/");
    return { hier: idx === -1 ? "" : base.slice(0, idx), name: base.slice(idx + 1) };
  };

  // Strip a trailing `@app/<id>/` scope segment first, so every scoped file kind
  // (override, origin, ancestor) collapses onto its base descriptor key exactly
  // like the un-scoped file would. `.*` is greedy so `<hier>` keeps its own slashes.
  const scoped = new RegExp(`^(.*)/${APP_SCOPE_DIR}/[^/]+/([^/]+)$`).exec(relPath);
  const bare = scoped ? `${scoped[1]!}/${scoped[2]!}` : relPath;

  // Longest suffix first — all three end in `.jsonc`. An ancestor snapshot anchors
  // to its base descriptor exactly like the origin it was captured from.
  if (bare.endsWith(".origin.jsonc")) return cut(bare, ".origin.jsonc");
  if (bare.endsWith(".ancestor.jsonc")) return cut(bare, ".ancestor.jsonc");
  if (bare.endsWith(".jsonc")) return cut(bare, ".jsonc");
  return null;
}
