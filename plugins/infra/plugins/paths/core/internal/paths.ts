import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const REPO_ROOT           = resolve(import.meta.dir, "..", "..", "..", "..", "..", "..");
export const PLUGINS_DIR         = join(REPO_ROOT, "plugins");

// Canonical location of the built frontend. `./singularity build` publishes the
// Vite output here and the gateway serves it. This is the ONE source of truth:
// the build CLI, the frontend-hash stale-tab signal, and the git-status
// build-commit marker all derive from these constants so the path can never
// silently diverge again (it previously pointed at a dead `web/dist`).
export const WEB_CORE_RELATIVE   = "plugins/framework/plugins/web-core";
export const WEB_DIST_DIR        = join(REPO_ROOT, WEB_CORE_RELATIVE, "dist");

export const MAIN_WORKTREE_NAME  = "singularity";

export function isMain(): boolean {
  return process.env.SINGULARITY_WORKTREE === MAIN_WORKTREE_NAME;
}

/**
 * The namespace this backend runs in: the worktree slug, or `MAIN_WORKTREE_NAME`
 * on main. Use to tag/scope per-namespace data so it can't leak across the
 * DB-fork boundary (a worktree DB is forked from main and inherits its rows).
 */
export function currentWorktreeName(): string {
  return process.env.SINGULARITY_WORKTREE ?? MAIN_WORKTREE_NAME;
}

export const HOME_DIR             = homedir();
export const SINGULARITY_DIR     = join(HOME_DIR, ".singularity");
export const BACKUPS_DIR         = join(HOME_DIR, ".backups/singularity");
export const SECRETS_DIR         = join(SINGULARITY_DIR, "secrets");
export const STORE_PATH          = join(SINGULARITY_DIR, "secrets.json.enc");
export const KEY_PATH            = join(SECRETS_DIR, ".key");
export const LEGACY_AUTH_DIR     = join(SINGULARITY_DIR, "auth");
export const LEGACY_AUTH_BLOB    = join(LEGACY_AUTH_DIR, "tokens.json.enc");
export const LEGACY_AUTH_KEY     = join(LEGACY_AUTH_DIR, ".key");
export const ATTACHMENTS_DIR     = join(SINGULARITY_DIR, "attachments");
export const REPORTS_DIR         = join(SINGULARITY_DIR, "reports");
export const CLAUDE_PROJECTS_DIR = join(HOME_DIR, ".claude", "projects");
export const CLAUDE_SESSIONS_DIR = join(HOME_DIR, ".claude", "sessions");
