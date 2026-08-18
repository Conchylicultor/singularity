import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

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

/**
 * The git-layer config tree (`config/<hier>/<name>.origin.jsonc`, overrides, and
 * `@app/<id>` scopes). Read directly at runtime by config_v2's raw-diff panel and
 * per-app un-fork check. In a release `REPO_ROOT` resolves into the compiled
 * binary's virtual FS (un-shipped, unreachable), so `launch.ts` points this at the
 * vendored tree via `SINGULARITY_REPO_CONFIG_DIR`; in dev it falls back to the repo.
 *
 * A FUNCTION for the same reason as {@link resolveDataRoot} and
 * {@link worktreesDir}: `launch.ts` sets its env var, and a const would capture
 * whatever the environment said when this module was first imported. With this
 * one converted, NO constant in this module freezes an environment read — which
 * is what retires `launch.ts`'s "do not statically import anything
 * path-dependent" ordering discipline.
 */
export function repoConfigDir(): string {
  return process.env.SINGULARITY_REPO_CONFIG_DIR ?? join(REPO_ROOT, "config");
}

// The web-core plugin dir, relative to a checkout root. Used for the
// per-checkout `.build.lock` beside it and (until S5) the legacy served-dist
// reap. It is NOT where a built frontend lives any more — see `webDistDir()`.
export const WEB_CORE_RELATIVE = "plugins/framework/plugins/web-core";

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

/**
 * The worktree name a CHECKOUT ON DISK carries: its root directory's basename.
 * This is the identity a **CLI process** has, and the one every per-worktree
 * artifact a CLI produces is keyed by (the op marker, the build profile, the
 * build-progress log, the DB fork name — and, since the release dist moved out
 * of the checkout, `worktreeArtifacts.releaseWebDist`).
 *
 * DELIBERATELY NOT {@link currentWorktreeName}, and the two are not
 * interchangeable:
 *
 * - `currentWorktreeName()` reads `SINGULARITY_WORKTREE`, which the gateway sets
 *   when it spawns a backend. It is the right answer THERE — a composition
 *   namespace's backend runs out of main's checkout, so only the env can say
 *   which namespace it serves.
 * - The CLI never sets `SINGULARITY_WORKTREE` for itself, so in a hand-run CLI
 *   process `currentWorktreeName()` answers `"singularity"` from *every*
 *   worktree. Anything a CLI writes per-worktree must therefore derive its name
 *   from the checkout it is operating on, never from the environment.
 *
 * Two processes that must agree on which checkout produced an artifact — a
 * `release` and the `build --hermetic` child it spawns with `cwd` at that same
 * root — both call this on that root, so they cannot drift.
 */
export function checkoutWorktreeName(root: string): string {
  return basename(root);
}

export const HOME_DIR = homedir();

/**
 * The singularity data root, derived AT CALL TIME.
 *
 * THE single derivation of the root, and the ONLY read of `SINGULARITY_DIR` in
 * this plugin. Not exported from the barrel on purpose: `dataRoot()`
 * (`./data-dir.ts`) is its public spelling, so a consumer that wants the root
 * gets the lazy function, and a consumer that wants a directory under it gets a
 * `DataDir`.
 *
 * There is deliberately no eager `SINGULARITY_DIR` const beside this any more.
 * A frozen snapshot of the root was both the second spelling that let the
 * registry be bypassed by hand (`join(SINGULARITY_DIR, "whatever")` minted an
 * undeclared top-level entry that nothing failed on) and a value captured at
 * whatever the environment said when this module was FIRST imported — while the
 * release launcher sets `SINGULARITY_DIR` before importing anything
 * path-dependent. `paths:data-root-not-joined` now fails on either way back.
 *
 * A function for that second reason, the same one that makes `webDistDir()` a
 * function and `DataDir.path` a getter. See `webDistDir`'s docblock below.
 */
export function resolveDataRoot(): string {
  return process.env.SINGULARITY_DIR ?? join(HOME_DIR, ".singularity");
}

// OUTSIDE the data root on purpose (`~/.backups/singularity`), which is why it
// is a plain constant here rather than a `defineDataDir` declaration: a backup
// that lived inside the tree it backs up would be reclaimed by the same sweep.
export const BACKUPS_DIR = join(HOME_DIR, ".backups/singularity");

// Everything else under the data root is a DECLARATION, not a constant here.
// This module used to carry a second spelling of nine of those directories
// (`SECRETS_DIR`, `ATTACHMENTS_DIR`, `PROTOTYPES_DIR`, …) as plain
// `join(SINGULARITY_DIR, …)` consts. Two spellings of one directory is how the
// registry gets quietly bypassed: the declaration moves and the const does not,
// so half the code writes to the new home and half goes on writing to the old
// one, with nothing to fail. Reach a directory through its owner's
// `data-dirs/index.ts` declaration — never by joining the root again.

/**
 * Root dir holding every worktree's per-worktree singularity state. Each
 * worktree owns `<worktreesDir()>/<name>/` (build/release artifacts, logs, ops
 * markers, the zero replica, …). THE single source of truth for the
 * `worktrees/<name>` layout — server plugins and the CLI both derive from it so
 * the base path can never diverge.
 *
 * `worktrees` is one of the eight `DATA_DIR_KINDS`, and this is the kind
 * directory itself rather than an entry under one, which is why it is spelled
 * here rather than declared with `defineDataDir`: its children are namespaces
 * minted at runtime, not a fixed set anyone could declare.
 *
 * A FUNCTION, not a const, for the reason in {@link resolveDataRoot} — a const
 * would freeze the root at whatever the environment said when this module was
 * first imported, which is precisely the bug the eager `SINGULARITY_DIR` used
 * to carry.
 */
export function worktreesDir(): string {
  return join(resolveDataRoot(), "worktrees");
}

/** The per-worktree data dir: `<worktreesDir()>/<name>/`. */
export function worktreeDataDir(name: string): string {
  return join(worktreesDir(), name);
}

/**
 * Canonical on-disk paths for per-worktree build/release artifacts.
 *
 * THE single source of truth for these filenames: every reader (the profiling /
 * build / release server plugins) and writer (the build/release CLI plus the
 * server-side orphan-recovery fallback) derives its path from here, so a layout
 * change is one edit and readers can never drift from writers.
 *
 * Most entries are FILES, and for those the `id`-less variant is the "most
 * recent / manual CLI" artifact while passing a build/release run id yields the
 * per-run artifact for that run.
 *
 * `webDist` and `releaseWebDist` are the exceptions: they are DIRECTORIES, not
 * files, and have no run-id variant. Each is a symlink published atomically by
 * `dist-publish.ts` at `<base>` → `<base>.live.<pid>` (with `<base>.staging.*` /
 * `<base>.swap.*` siblings in flight), so the path named here is the stable
 * pointer, never the tree itself. Their cleanup is NOT the file-retention
 * pruner (`pruneWorktreeBuildArtifacts`, which only ever matches the file
 * patterns above): a dist tree is reclaimed by `sweepDistLeftovers` at publish
 * time and, wholesale, by `removeWorktreeSpec`'s recursive remove of
 * `worktreeDataDir(name)` (`infra/worktree/server/internal/spec.ts`).
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
  /**
   * DIRECTORY. The web dist SERVED for namespace `name` — the tree the gateway
   * points at for `<name>.localhost:9000`. `name` is a *namespace*: a worktree
   * slug (`singularity`, an agent branch) or an auto-served composition id.
   */
  webDist: (name: string): string => join(worktreeDataDir(name), "web"),
  /**
   * DIRECTORY. A release's scratch web dist — copied into the shippable bundle
   * and served by nobody. Keyed by the worktree that BUILT it (not a namespace:
   * a release has none), so two checkouts releasing the same composition, or one
   * checkout releasing two, can never share a tree.
   */
  releaseWebDist: (worktree: string, composition: string): string =>
    join(worktreeDataDir(worktree), "release-web", composition),
} as const;

/**
 * The built frontend THIS BACKEND is serving — the tree the gateway hands the
 * browser for this backend's namespace. The one source of truth for the runtime
 * readers of the served bundle: the frontend-hash stale-tab signal
 * (`index.html`), the "N commits behind main" base (`.build-commit`) and the
 * report-tagging build id (`.build-id`).
 *
 * A FUNCTION, not a const, for two independent reasons — do not re-freeze it at
 * module eval:
 *
 * - `SINGULARITY_WEB_DIST` is set by the release launcher (`launch.ts`) before
 *   it imports anything path-dependent, but a const here would still capture
 *   whatever the env said when *this* module was first imported. In a release
 *   the alternative — deriving from `REPO_ROOT` — resolves into the compiled
 *   binary's virtual FS, which is why a release used to report a null build id.
 * - The derived arm is per-NAMESPACE (`currentWorktreeName()`, i.e. the
 *   `SINGULARITY_WORKTREE` the gateway spawned this backend with), and an
 *   auto-served composition's backend runs out of MAIN's checkout. A
 *   `REPO_ROOT`-derived path made every such backend read main's dist and
 *   report main's build id and build commit.
 *
 * Correct only in a backend, where the gateway sets `SINGULARITY_WORKTREE`. A
 * CLI process must use `worktreeArtifacts.webDist(checkoutWorktreeName(root))`
 * instead — see {@link checkoutWorktreeName}.
 */
export function webDistDir(): string {
  return (
    process.env.SINGULARITY_WEB_DIST ??
    worktreeArtifacts.webDist(currentWorktreeName())
  );
}

export const CLAUDE_DIR = join(HOME_DIR, ".claude");
export const CLAUDE_PROJECTS_DIR = join(HOME_DIR, ".claude", "projects");
export const CLAUDE_SESSIONS_DIR = join(HOME_DIR, ".claude", "sessions");
