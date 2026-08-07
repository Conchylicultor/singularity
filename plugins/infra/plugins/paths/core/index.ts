export {
  REPO_ROOT,
  REPO_CONFIG_DIR,
  PLUGINS_DIR,
  HOME_DIR,
  SINGULARITY_DIR,
  BACKUPS_DIR,
  SECRETS_DIR,
  STORE_PATH,
  KEY_PATH,
  LEGACY_AUTH_DIR,
  LEGACY_AUTH_BLOB,
  LEGACY_AUTH_KEY,
  ATTACHMENTS_DIR,
  REPORTS_DIR,
  COST_USAGE_DIR,
  WORKTREES_DIR,
  worktreeDataDir,
  worktreeArtifacts,
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
} from "./internal/paths";
export type { ReleaseIdentity } from "./internal/paths";

// The check transcript is written by the check runner, which is a `core`-runtime
// module — so its prune has to be reachable from `core`. The build/release prunes
// stay `server`-only exports because every one of their writers is server-side;
// exporting them here too would only widen the surface for no caller.
export {
  pruneWorktreeCheckArtifacts,
  CHECK_ARTIFACTS_RETENTION,
} from "./internal/prune-artifacts";
