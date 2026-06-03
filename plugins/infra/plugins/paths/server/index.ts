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
  CRASHES_DIR,
  CLAUDE_PROJECTS_DIR,
  CLAUDE_SESSIONS_DIR,
  MAIN_WORKTREE_NAME,
  isMain,
} from "../core/internal/paths";

export { GIT, PGREP, CLAUDE, TMUX } from "./internal/bins";

// No `satisfies ServerPluginDefinition` — this barrel is transitively imported
// by secrets/central, whose tsconfig lacks the @server alias.
export default { id: "paths", name: "Paths" };
