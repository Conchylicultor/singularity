export {
  REPO_ROOT,
  repoConfigDir,
  PLUGINS_DIR,
  WEB_CORE_RELATIVE,
  webDistDir,
  HOME_DIR,
  BACKUPS_DIR,
  worktreesDir,
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
  checkoutWorktreeName,
} from "../core/internal/paths";
export type { ReleaseIdentity } from "../core/internal/paths";

// The declared-directory registry for the data root, re-exported from the
// server barrel exactly as the core barrel exports it — same module, so a
// declaration made through either specifier lands in the one registry. Server
// plugins are the bulk of the writers under the root, and a server file that
// had to reach into `…/paths/core` for `defineDataDir` while taking every other
// path from `…/paths/server` is the friction that keeps people joining the root
// by hand. There is no `SINGULARITY_DIR` above any more: `dataRoot()` is the
// only spelling of the root, and `paths:data-root-not-joined` fails on joining
// it or on re-reading its environment variable.
export {
  DATA_DIR_KINDS,
  dataRoot,
  defineDataDir,
  getDataDirs,
  relativeToDataRoot,
} from "../core/internal/data-dir";
export type {
  DataDir,
  DataDirKind,
  DataDirSpec,
  ReclaimPolicy,
} from "../core/internal/data-dir";

export { GIT, PGREP, PS, CLAUDE, TMUX } from "./internal/bins";

export { listWorktreeDirs } from "./internal/worktree-dirs";

export {
  pruneWorktreeBuildArtifacts,
  pruneWorktreeReleaseArtifacts,
  pruneWorktreeCheckArtifacts,
  BUILD_ARTIFACTS_RETENTION,
  RELEASE_ARTIFACTS_RETENTION,
  CHECK_ARTIFACTS_RETENTION,
} from "../core/internal/prune-artifacts";

import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export default {} satisfies ServerPluginDefinition;
