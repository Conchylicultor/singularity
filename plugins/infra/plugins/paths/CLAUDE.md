# paths

The single source of truth for **where things are on this machine**: the repo
root, the user's home, the Claude corpus, the per-worktree artifact layout, and
the singularity data root (`~/.singularity/`).

`core/` here means **runtime-neutral Node, not web-safe** — it reaches
`node:os` / `node:fs` / `node:path` and must never be imported from `web/`. A
browser that needs to *name* a directory reads the string literals in the
`display` sub-plugin instead.

## The data root is a registry, not a string

Everything under `~/.singularity/` is a **declared directory with an owner**.
Nothing joins the root by hand — that is how it accreted 60+ entries nobody
could classify, of which nine were orphans with no reference left in the repo.

```ts
import { defineDataDir } from "@plugins/infra/plugins/paths/core";

export const checkCache = defineDataDir({
  kind: "cache",
  name: "check",
  owner: "framework/tooling/checks",
  description: "Recorded check verdicts, keyed by working-tree hash",
  reclaim: { kind: "safe" },
});

checkCache.ensure();                 // mkdir -p, returns the path
checkCache.file("abc123.json");      // a path INSIDE it
```

### The kinds are a closed set

`apps` · `worktrees` · `services` · `state` · `cache` · `locks` · `logs` ·
`deprecated`.

A kind is a **reclaim class** — the answer to "may I delete this whole subtree?"
that a size listing can never give you. `cache/` and `locks/` are reclaimable
wholesale; `state/` and `apps/` hold the only copy of something. Adding a kind is
a reviewed edit to `DATA_DIR_KINDS`, and that friction is the point.

### The root itself is unjoinable

`dataRoot()` returns the root, and its **only** legitimate use is handing that
root to a child process as its `SINGULARITY_DIR` (the gateway spawn, a release
launch, a remote deploy's env line) — or reporting it to a human.
`join(dataRoot(), …)` is exactly what `defineDataDir` exists to replace: a
joined root is an undeclared directory, which is the failure mode the registry
is here to make impossible.

`paths:data-root-not-joined` enforces it: no `join`/`resolve`/`` `${…}/` `` of
`dataRoot()`, and no **read** of `process.env.SINGULARITY_DIR` outside a
four-entry allowlist (a raw env read is a second derivation of the root).
**Writing** that var — `=`, `??=`, an `env: {…}` key — is the handoff to a child
and is never flagged; `*.test.ts` is exempt, since a test owning its own root is
correct.

To name a declared location under a root that is **not** this process's own (a
preview's `/tmp` data dir, a fresh install's), use `relativeToDataRoot(dir, …)`.
It takes a `DataDir`, so the answer comes from the declaration.

`dataRoot()` is a **function**, and `DataDir.path` is a **getter** — never a
value frozen at module eval. `SINGULARITY_DIR` is env-overridable and the release
launcher sets it *before* importing anything path-dependent, while
`defineDataDir` runs at consumer module eval, which is earlier still. This is the
same reasoning that made `webDistDir()` a function; the frozen-const form there
is what once made a release report a null build id.

### Adding a new data dir

1. Create `plugins/<your-plugin>/data-dirs/index.ts` and default-export a
   `DataDir[]` of your `defineDataDir(...)` calls. `data-dirs` is a
   **collected dir** (marked by `defineCollectedDir("data-dirs")` in this
   plugin's `core/collected-dir.ts`), auto-discovered by codegen exactly like
   `check/` — no registry edit, no codegen edit.
2. Import the declaration from your own plugin's code and read `.path` /
   `.file(…)` / `.ensure()`. Never re-derive the path.
3. Run `./singularity build`, then `./singularity check paths:no-undeclared-data-dirs`.

A directory is declared **exactly once** — a duplicate `${kind}/${name}` throws,
mirroring `defineFileSink`. Two owners claiming one directory is always a bug.

`paths:no-undeclared-data-dirs` reads the REAL root and fails on any top-level
entry that is neither declared nor grandfathered. Grandfathering is driven by
one `LEGACY_LAYOUT` table (`core/internal/legacy-layout.ts`), shared by the
check and by the one-off `bun plugins/infra/plugins/paths/scripts/migrate-data-layout.ts`
(dry-run by default; `--apply` moves bytes and leaves a compat symlink at the
old path; `--drop-legacy` removes it once every worktree has rebuilt), so the
to-do list and the migration plan can't drift. A legacy name passes only if
it's a symlink resolving to its declared target — a real directory there is a
failure, not a tolerated leftover.

**A shim is only planted where one can hold.** It works by standing in for the
BYTES BEHIND a name, so it survives a writer that appends or truncates in place
— and not one that writes the NAME ITSELF: an `unlink`, an atomic
`rename(tmp, name)`, a log rotation renaming `x` to `x.1`. Each of those removes
or replaces the link on its first write, silently splitting old and new code
onto two files. A row whose pre-move writer does that is `move: "unshimmable"`
and states what it `leaves` at the root (`"nothing"` when the writer unlinks,
`"a file"` when it replaces), and the check's expectation is derived from that —
so a row cannot claim a steady state its writer does not produce. Where a shim
IS held and a pre-move writer replaced it anyway, `--apply` rescues the stray
beside its family as `<name>.pre-move-<n>` and re-plants the shim; it discards
neither side, and stops with the sizes when the two readings (a replaced shim,
or the original never moved) are indistinguishable.

The check also polices the second level:
every entry inside a kind directory must itself be a declared `${kind}/${name}`.
Table, script and check rule are all deleted together once `--drop-legacy` has
run everywhere.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Core:
  - Uses:
    - `framework/tooling/collected-dir.defineCollectedDir`
    - `infra/namespace.asNamespace`
    - `infra/namespace.MAIN_COMPOSITION_ID`
    - `infra/namespace.Namespace`
    - `infra/namespace.namespaceFor`
  - Exports (types):
    - `DataDir`
    - `DataDirKind`
    - `DataDirSpec`
    - `LegacyMove`
    - `MigrationStep`
    - `ReclaimPolicy`
    - `ReleaseIdentity`
  - Exports (values):
    - `BACKUPS_DIR`
    - `CHECK_ARTIFACTS_RETENTION`
    - `checkoutWorktreeName`
    - `CLAUDE_DIR`
    - `CLAUDE_PROJECTS_DIR`
    - `CLAUDE_SESSIONS_DIR`
    - `currentWorktreeName`
    - `DATA_DIR_KINDS`
    - `dataRoot`
    - `defineDataDir`
    - `getDataDirs`
    - `HOME_DIR`
    - `isHostSingleton`
    - `isMain`
    - `isRelease`
    - `LEGACY_LAYOUT`
    - `MAIN_WORKTREE_NAME`
    - `planMigration`
    - `PLUGINS_DIR`
    - `pruneWorktreeCheckArtifacts`
    - `relativeToDataRoot`
    - `releaseIdentity`
    - `REPO_ROOT`
    - `repoConfigDir`
    - `setReleaseIdentity`
    - `WORKTREE_SPEC_FILE`
    - `worktreeArtifacts`
    - `worktreeDataDir`
    - `worktreesDir`
- Cross-plugin:
  - Imported by:
    - `apps/deploy/deployments`
    - `apps/prototypes/files`
    - `backup`
    - `backup/sources/claude-settings`
    - `backup/sources/project-memory`
    - `backup/targets/local`
    - `build`
    - `build/build-commits`
    - `build/build-logs`
    - `build/build-profiling`
    - `build/deployment`
    - `build/serve-composition`
    - `build/server-build-id`
    - `code-explorer`
    - `code-explorer/file-resolve`
    - `config_v2`
    - `conversations`
    - `conversations/conversation-progress`
    - `conversations/conversation-view/op-status`
    - `conversations/conversations-view/queue`
    - `conversations/hibernation`
    - `conversations/runtime-tmux`
    - `conversations/transcript-watcher`
    - `database/zero/cache-service`
    - `debug/boot-events`
    - `debug/boot-watchdog`
    - `debug/health-monitor`
    - `debug/heap-snapshot`
    - `debug/memory`
    - `debug/paging-probe`
    - `debug/profiling/build`
    - `debug/profiling/ops`
    - `debug/sentinel`
    - `debug/session-divergence`
    - `debug/timeline`
    - `debug/trace/engine`
    - `debug/worktree-cleanup`
    - `framework/tooling/checks`
    - `framework/tooling/guards`
    - `infra/claude-cli`
    - `infra/corpus-index`
    - `infra/git-watcher`
    - `infra/launcher`
    - `infra/warmup`
    - `infra/worktree`
    - `infra/worktree/removal-audit`
    - `plugin-meta/plugin-health`
    - `plugin-meta/plugin-tree`
    - `primitives/commit-list`
    - `primitives/log-channels`
    - `primitives/terminal`
    - `release`
    - `release/bundles`
    - `review/plugin-changes`
    - `stats/commits`
    - `stats/cost`
    - `tasks`
- Server:
  - Exports (types):
    - `DataDir`
    - `DataDirKind`
    - `DataDirSpec`
    - `ReclaimPolicy`
    - `ReleaseIdentity`
  - Exports (values):
    - `BACKUPS_DIR`
    - `BUILD_ARTIFACTS_RETENTION`
    - `CHECK_ARTIFACTS_RETENTION`
    - `checkoutRef`
    - `checkoutWorktreeName`
    - `CLAUDE`
    - `CLAUDE_DIR`
    - `CLAUDE_PROJECTS_DIR`
    - `CLAUDE_SESSIONS_DIR`
    - `currentWorktreeName`
    - `DATA_DIR_KINDS`
    - `dataRoot`
    - `defineDataDir`
    - `getDataDirs`
    - `GIT`
    - `HOME_DIR`
    - `isHostSingleton`
    - `isMain`
    - `isRelease`
    - `listWorktreeDirs`
    - `MAIN_WORKTREE_NAME`
    - `PGREP`
    - `PLUGINS_DIR`
    - `pruneWorktreeBuildArtifacts`
    - `pruneWorktreeCheckArtifacts`
    - `pruneWorktreeReleaseArtifacts`
    - `PS`
    - `relativeToDataRoot`
    - `RELEASE_ARTIFACTS_RETENTION`
    - `releaseIdentity`
    - `REPO_ROOT`
    - `repoConfigDir`
    - `setReleaseIdentity`
    - `TMUX`
    - `WEB_CORE_RELATIVE`
    - `webDistDir`
    - `WORKTREE_SPEC_FILE`
    - `worktreeArtifacts`
    - `worktreeDataDir`
    - `worktreesDir`
- Sub-plugins:
  - **`display`** — The human-facing spelling of the singularity data dirs (the `~/…` form a message, an empty state, or an agent prompt writes). Web-safe by construction: string literals only, no node:* and no homedir() — so the browser can name a directory the server resolves.

<!-- AUTOGENERATED:END -->
