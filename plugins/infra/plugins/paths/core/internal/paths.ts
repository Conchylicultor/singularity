import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const REPO_ROOT           = resolve(import.meta.dir, "..", "..", "..", "..", "..", "..");
export const PLUGINS_DIR         = join(REPO_ROOT, "plugins");

// The git-layer config tree (`config/<hier>/<name>.origin.jsonc`, overrides, and
// `@app/<id>` scopes). Read directly at runtime by config_v2's raw-diff panel and
// per-app un-fork check. In a release `REPO_ROOT` resolves into the compiled
// binary's virtual FS (un-shipped, unreachable), so `launch.ts` points this at the
// vendored tree via `SINGULARITY_REPO_CONFIG_DIR`; in dev it falls back to the repo.
export const REPO_CONFIG_DIR     = process.env.SINGULARITY_REPO_CONFIG_DIR ?? join(REPO_ROOT, "config");

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
export const SINGULARITY_DIR     = process.env.SINGULARITY_DIR ?? join(HOME_DIR, ".singularity");
export const BACKUPS_DIR         = join(HOME_DIR, ".backups/singularity");
export const SECRETS_DIR         = join(SINGULARITY_DIR, "secrets");
export const STORE_PATH          = join(SINGULARITY_DIR, "secrets.json.enc");
export const KEY_PATH            = join(SECRETS_DIR, ".key");
export const LEGACY_AUTH_DIR     = join(SINGULARITY_DIR, "auth");
export const LEGACY_AUTH_BLOB    = join(LEGACY_AUTH_DIR, "tokens.json.enc");
export const LEGACY_AUTH_KEY     = join(LEGACY_AUTH_DIR, ".key");
export const ATTACHMENTS_DIR     = join(SINGULARITY_DIR, "attachments");
export const REPORTS_DIR         = join(SINGULARITY_DIR, "reports");

// Root dir holding every worktree's per-worktree singularity state. Each
// worktree owns `<WORKTREES_DIR>/<name>/` (build/release artifacts, logs,
// ops markers, the zero replica, …). THE single source of truth for the
// `worktrees/<name>` layout — server plugins and the CLI both derive from it
// so the base path can never diverge.
export const WORKTREES_DIR       = join(SINGULARITY_DIR, "worktrees");

/** The per-worktree data dir: `<WORKTREES_DIR>/<name>/`. */
export function worktreeDataDir(name: string): string {
  return join(WORKTREES_DIR, name);
}

/**
 * Canonical on-disk paths for per-worktree build/release artifacts.
 *
 * THE single source of truth for these filenames: every reader (the profiling /
 * build / release server plugins) and writer (the build/release CLI plus the
 * server-side orphan-recovery fallback) derives its path from here, so a layout
 * change is one edit and readers can never drift from writers.
 *
 * The `id`-less variants are the "most recent / manual CLI" artifacts; passing a
 * build/release run id yields the per-run artifact for that run.
 */
export const worktreeArtifacts = {
  /** Build profiler spans. `build-profile.json` or `build-profile-<id>.json`. */
  buildProfile: (name: string, buildId?: string): string =>
    join(
      worktreeDataDir(name),
      buildId ? `build-profile-${buildId}.json` : "build-profile.json",
    ),
  /** Structured build transcript. `build-logs.json` or `build-logs-<id>.json`. */
  buildLogs: (name: string, buildId?: string): string =>
    join(
      worktreeDataDir(name),
      buildId ? `build-logs-${buildId}.json` : "build-logs.json",
    ),
  /** Human-readable build transcript. `build.log` or `build-<id>.log`. */
  buildLogText: (name: string, buildId?: string): string =>
    join(worktreeDataDir(name), buildId ? `build-${buildId}.log` : "build.log"),
  /** Per-release fallback log. Always keyed to a release run id. */
  releaseLogs: (name: string, releaseId: string): string =>
    join(worktreeDataDir(name), `release-logs-${releaseId}.json`),
} as const;
export const CLAUDE_DIR          = join(HOME_DIR, ".claude");
export const CLAUDE_PROJECTS_DIR = join(HOME_DIR, ".claude", "projects");
export const CLAUDE_SESSIONS_DIR = join(HOME_DIR, ".claude", "sessions");
