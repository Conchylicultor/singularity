import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const REPO_ROOT = resolve(
  import.meta.dir,
  "..",
  "..",
  "..",
  "..",
  "..",
  "..",
);
export const PLUGINS_DIR = join(REPO_ROOT, "plugins");

// The git-layer config tree (`config/<hier>/<name>.origin.jsonc`, overrides, and
// `@app/<id>` scopes). Read directly at runtime by config_v2's raw-diff panel and
// per-app un-fork check. In a release `REPO_ROOT` resolves into the compiled
// binary's virtual FS (un-shipped, unreachable), so `launch.ts` points this at the
// vendored tree via `SINGULARITY_REPO_CONFIG_DIR`; in dev it falls back to the repo.
export const REPO_CONFIG_DIR =
  process.env.SINGULARITY_REPO_CONFIG_DIR ?? join(REPO_ROOT, "config");

// Canonical location of the built frontend. `./singularity build` publishes the
// Vite output here and the gateway serves it. This is the ONE source of truth:
// the build CLI, the frontend-hash stale-tab signal, and the git-status
// build-commit marker all derive from these constants so the path can never
// silently diverge again (it previously pointed at a dead `web/dist`).
export const WEB_CORE_RELATIVE = "plugins/framework/plugins/web-core";
export const WEB_DIST_DIR = join(REPO_ROOT, WEB_CORE_RELATIVE, "dist");

export const MAIN_WORKTREE_NAME = "singularity";

export function isMain(): boolean {
  return process.env.SINGULARITY_WORKTREE === MAIN_WORKTREE_NAME;
}

/**
 * True when this backend is running inside a compiled release artifact (the
 * `launch` binary sets `SINGULARITY_RELEASE=1` before bringing up the app; it
 * propagates launch → gateway → backend). A release runs exactly ONE backend
 * per host, so this is the release-side twin of `isMain()` for host-singleton
 * work (e.g. the cluster sentinel + duress latch): in a release the backend's
 * `SINGULARITY_WORKTREE` is the composition name, so `isMain()` is false, yet
 * that single backend IS the host singleton.
 */
export function isRelease(): boolean {
  return process.env.SINGULARITY_RELEASE === "1";
}

/**
 * True when THIS backend is the one that owns host-wide singleton work — the
 * host-global caches/archives, the cluster-wide samplers, the once-per-host
 * scheduled sweeps. Gate such work on this, never on `isMain()` alone.
 *
 * In dev the fleet is many worktree backends and main is that singleton. In a
 * compiled release there is exactly ONE backend per host, but it runs under the
 * composition name, so `isMain()` is false — gating on `isMain()` means the work
 * silently never runs in a release, which is invisible precisely because there
 * is no second backend to notice the gap.
 */
export function isHostSingleton(): boolean {
  return isMain() || isRelease();
}

/** WHICH build is running. Both fields are null outside a release. */
export interface ReleaseIdentity {
  /** The release run that produced this bundle (`RELEASE.json.runId`). */
  runId: string | null;
  /** The composition this bundle is (`RELEASE.json.composition`). */
  composition: string | null;
}

// Where the identity rides: the same launch → gateway → backend env chain
// `isRelease()` uses (the gateway spreads `process.env` into the gateway spawn
// and forwards `os.Environ()` to the backend). Private to this module on
// purpose — `setReleaseIdentity` / `releaseIdentity` are the only surface, so
// the names exist once and no consumer can spell one of them wrong.
const RUN_ID_ENV = "SINGULARITY_RELEASE_RUN_ID";
const COMPOSITION_ENV = "SINGULARITY_RELEASE_COMPOSITION";

/**
 * Read which build is serving. This is a *propagation* of `RELEASE.json`, not a
 * second authority: the launcher stamps it verbatim from the manifest it already
 * parses, so a consumer reading it (the health payload, so a deploy can prove
 * the build it shipped is the build now answering) cannot be told a different
 * story than the bundle's own record.
 */
export function releaseIdentity(): ReleaseIdentity {
  return {
    runId: process.env[RUN_ID_ENV] ?? null,
    composition: process.env[COMPOSITION_ENV] ?? null,
  };
}

/**
 * Stamp the release identity into the environment, for inheritance by every
 * process spawned after this call. Called by the launcher from the manifest,
 * BEFORE the gateway spawn — a child's env is snapshotted at spawn, so a later
 * write would never reach the backend.
 */
export function setReleaseIdentity(identity: ReleaseIdentity): void {
  for (const [key, value] of [
    [RUN_ID_ENV, identity.runId],
    [COMPOSITION_ENV, identity.composition],
  ] as const) {
    // A null field deletes rather than writes "null" / "": an absent var is how
    // "not a release" is spelled, and a stale inherited value must not survive.
    if (value === null) delete process.env[key];
    else process.env[key] = value;
  }
}

/**
 * The namespace this backend runs in: the worktree slug, or `MAIN_WORKTREE_NAME`
 * on main. Use to tag/scope per-namespace data so it can't leak across the
 * DB-fork boundary (a worktree DB is forked from main and inherits its rows).
 */
export function currentWorktreeName(): string {
  return process.env.SINGULARITY_WORKTREE ?? MAIN_WORKTREE_NAME;
}

export const HOME_DIR = homedir();
export const SINGULARITY_DIR =
  process.env.SINGULARITY_DIR ?? join(HOME_DIR, ".singularity");
export const BACKUPS_DIR = join(HOME_DIR, ".backups/singularity");
export const SECRETS_DIR = join(SINGULARITY_DIR, "secrets");
export const STORE_PATH = join(SINGULARITY_DIR, "secrets.json.enc");
export const KEY_PATH = join(SECRETS_DIR, ".key");
export const LEGACY_AUTH_DIR = join(SINGULARITY_DIR, "auth");
export const LEGACY_AUTH_BLOB = join(LEGACY_AUTH_DIR, "tokens.json.enc");
export const LEGACY_AUTH_KEY = join(LEGACY_AUTH_DIR, ".key");
export const ATTACHMENTS_DIR = join(SINGULARITY_DIR, "attachments");
export const REPORTS_DIR = join(SINGULARITY_DIR, "reports");
// Host-global incremental usage index for stats/cost. The `~/.claude/projects`
// corpus is shared by every backend, so its aggregate is identical across
// worktrees — the cache lives under the host-global root, not a per-worktree DB.
export const COST_USAGE_DIR = join(SINGULARITY_DIR, "cost-usage");

// Root dir holding every worktree's per-worktree singularity state. Each
// worktree owns `<WORKTREES_DIR>/<name>/` (build/release artifacts, logs,
// ops markers, the zero replica, …). THE single source of truth for the
// `worktrees/<name>` layout — server plugins and the CLI both derive from it
// so the base path can never diverge.
export const WORKTREES_DIR = join(SINGULARITY_DIR, "worktrees");

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
  /**
   * The deploy receipt: this worktree's LAST build, whatever became of it.
   *
   * Deliberately the one artifact here with NO `<id>` variant. Every sibling is
   * per-run, so "did my build land?" can only be asked of them through a glob
   * (`ls -t build-*.log | head -1`) — and that answers with a *previous* run's
   * `BUILD OK` whenever the current one was killed before writing its own. A
   * fixed path cannot do that: a killed build leaves this file at
   * `status: "running"` with a dead pid, and there is no older success for it to
   * be confused with. Do not add a `buildId` parameter.
   */
  buildStatus: (name: string): string =>
    join(worktreeDataDir(name), "build-status.json"),
  /**
   * One check run's full, untruncated transcript. ALWAYS id-keyed (like
   * `releaseLogs`, unlike `buildStatus` directly above), and for a reason that
   * is the mirror image of the receipt's.
   *
   * A transcript is only COMPLETE once its run ends. Under a fixed path, a run
   * killed mid-checks therefore writes nothing and silently leaves its
   * predecessor's file in place — so the killed run's own verdict points a
   * reader at another run's failures. The receipt escapes that trap from the
   * other side: it is written EARLY and is meaningful while incomplete, so it
   * never needs an id. A transcript cannot be, so it buys the same guarantee
   * with identity instead. Do not converge the two.
   *
   * `runId` is the caller's OWN id — a build's `buildId`, a standalone check's
   * `opId` — never a fresh one: reusing it is what joins this file to the
   * `build-<id>.log` beside it and to the run's lines in `check-progress.jsonl`.
   */
  checkLog: (name: string, runId: string): string =>
    join(worktreeDataDir(name), `check-${runId}.log`),
  /** Per-release fallback log. Always keyed to a release run id. */
  releaseLogs: (name: string, releaseId: string): string =>
    join(worktreeDataDir(name), `release-logs-${releaseId}.json`),
} as const;
export const CLAUDE_DIR = join(HOME_DIR, ".claude");
export const CLAUDE_PROJECTS_DIR = join(HOME_DIR, ".claude", "projects");
export const CLAUDE_SESSIONS_DIR = join(HOME_DIR, ".claude", "sessions");
