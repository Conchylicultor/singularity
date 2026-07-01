export {
  REPO_ROOT,
  PLUGINS_DIR,
  WEB_CORE_RELATIVE,
  WEB_DIST_DIR,
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
  WORKTREES_DIR,
  worktreeDataDir,
  worktreeArtifacts,
  CLAUDE_DIR,
  CLAUDE_PROJECTS_DIR,
  CLAUDE_SESSIONS_DIR,
  MAIN_WORKTREE_NAME,
  isMain,
  currentWorktreeName,
} from "../core/internal/paths";

export { GIT, PGREP, CLAUDE, TMUX } from "./internal/bins";

export {
  pruneWorktreeBuildArtifacts,
  pruneWorktreeReleaseArtifacts,
  BUILD_ARTIFACTS_RETENTION,
  RELEASE_ARTIFACTS_RETENTION,
} from "./internal/prune-artifacts";

import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export default {
} satisfies ServerPluginDefinition;
