export {
  REPO_ROOT,
  repoConfigDir,
  PLUGINS_DIR,
  HOME_DIR,
  BACKUPS_DIR,
  worktreesDir,
  worktreeDataDir,
  worktreeArtifacts,
  WORKTREE_SPEC_FILE,
  RUN_TRANSCRIPT_SUFFIX,
  RUN_TERMINAL_SUFFIX,
  CLAUDE_DIR,
  CLAUDE_PROJECTS_DIR,
  CLAUDE_SESSIONS_DIR,
  MAIN_WORKTREE_NAME,
  isMain,
  isRelease,
  isHostSingleton,
  releaseIdentity,
  setReleaseIdentity,
  currentWorktreeName,
  checkoutWorktreeName,
} from "./internal/paths";
export type { ReleaseIdentity } from "./internal/paths";

// The declared-directory registry for the data root. `dataRoot()` is the ONLY
// way to name the root and `defineDataDir` the only way to name anything under
// it — the plain `SINGULARITY_DIR` string that used to sit above is gone, and
// `paths:data-root-not-joined` fails on both ways back to it (joining the root,
// or re-reading its environment variable).
export {
  DATA_DIR_KINDS,
  dataRoot,
  defineDataDir,
  getDataDirs,
  relativeToDataRoot,
} from "./internal/data-dir";
export type {
  DataDir,
  DataDirKind,
  DataDirSpec,
  ReclaimPolicy,
} from "./internal/data-dir";

// The one legacy table: where each declared directory USED to sit, and what has
// to happen to it. Two consumers read it — `paths:no-undeclared-data-dirs`
// (which derives its grandfathering from the `from` names, so the check's to-do
// list and the migration's plan are the same fact) and the one-off
// `scripts/migrate-data-layout.ts` (which executes it). Self-liquidating: table,
// planner and the check's symlink-verified grandfathering are deleted together
// once the drop-legacy pass has run everywhere.
export { LEGACY_LAYOUT, planMigration } from "./internal/legacy-layout";
export type { LegacyMove, MigrationStep } from "./internal/legacy-layout";

// The check transcript is written by the check runner, which is a `core`-runtime
// module — so its prune has to be reachable from `core`. The build prune stays a
// `server`-only export because every one of its writers is server-side; exporting
// it here too would only widen the surface for no caller.
export {
  pruneWorktreeCheckArtifacts,
  CHECK_ARTIFACTS_RETENTION,
} from "./internal/prune-artifacts";
