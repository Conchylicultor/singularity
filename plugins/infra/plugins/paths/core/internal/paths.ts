import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
  asNamespace,
  namespaceFor,
  MAIN_COMPOSITION_ID,
  type Namespace,
} from "@plugins/infra/plugins/namespace/core";

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

/**
 * The namespace the main app answers to.
 *
 * DERIVED, not a second literal: it is what the elision rule yields for the main
 * composition on the main checkout. Spelling it as a constant here again is how
 * "singularity" ended up meaning two different things in two files.
 */
export const MAIN_WORKTREE_NAME: Namespace = namespaceFor(MAIN_COMPOSITION_ID, {
  kind: "main",
});

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
export function currentWorktreeName(): Namespace {
  const raw = process.env.SINGULARITY_WORKTREE;
  // A serialization boundary: the gateway wrote this env var from a spec-dir
  // basename, so it is validated on the way in rather than trusted. A malformed
  // namespace becomes a path and a database name, so being loud here is cheap.
  return raw === undefined ? MAIN_WORKTREE_NAME : asNamespace(raw);
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
 *
 * Returns a plain `string`, NOT a {@link Namespace}, and that is the point. A
 * checkout name is one INPUT to a namespace, not a namespace: they are equal for
 * every agent worktree today and stop being equal the moment a composition is
 * served from a non-main checkout. Mint the namespace with `namespaceFor` (or
 * `checkoutRef` from the server barrel) instead of passing this through.
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
export function worktreeDataDir(name: Namespace): string {
  return join(worktreesDir(), name);
}

/**
 * The per-worktree supervised-run artifact dir: `<worktreeDataDir()>/runs/`.
 *
 * A SUBDIRECTORY, where every other artifact family here is a flat file beside
 * its siblings, and the reason is that this family has a *watcher* on it. The
 * supervised-run supervisor publishes a live run's output by tailing its
 * transcript, and it learns the file grew from one `@parcel/watcher`
 * subscription over the directory the transcripts live in. Pointed at the data
 * dir itself that subscription would also wake on every build profile, build
 * log, check transcript and spec write in the worktree — so the directory is
 * what keeps the watch narrow, not a filter the watcher would have to remember.
 *
 * A second, smaller reason: the prune is directory-scoped
 * (`pruneRunArtifactsInDir`), so keeping the newest N runs cannot even in
 * principle see a `build-<id>.log` — the two families never share a directory.
 *
 * Spelled as a function above `worktreeArtifacts` because the object literal
 * cannot reference its own entries while it is being constructed; the public
 * spelling is `worktreeArtifacts.runsDir`.
 */
function runsDirFor(name: Namespace): string {
  return join(worktreeDataDir(name), "runs");
}

/**
 * The two filename suffixes of the supervised-run family.
 *
 * Exported, unlike every other suffix in this file, because this family has a
 * READER that goes the other way: the supervisor watches the directory and has
 * to turn each event's filename back into a (kind, run) pair. Without these it
 * would spell `".exit-code"` itself — a second copy of the layout, in the one
 * place a drift would silently stop every run from ever being closed. The prune
 * (`prune-artifacts.ts`) reads them for the same reason.
 */
export const RUN_TRANSCRIPT_SUFFIX = ".log";
export const RUN_TERMINAL_SUFFIX = ".exit-code";

/**
 * The gateway's registration record for a namespace: `spec.json`, inside that
 * namespace's own data dir.
 *
 * THREE processes share this one file, which is why the name has to have one
 * owner. `writeWorktreeSpec` (`infra/worktree/server/internal/spec.ts`)
 * publishes it — atomically, via a temp file it renames from, beside it. The Go
 * gateway watches `worktrees/*` for it and spawns a backend from what it says.
 * That backend then reads the SAME bytes back at boot to learn which
 * composition it serves (`server-core/bin/spec-composition.ts`), rather than
 * being told over a hop a stale gateway binary could drop.
 *
 * Exported as the bare filename as well as through `worktreeArtifacts.spec`
 * below, because the boot reader is HANDED its worktrees dir (so it stays a
 * pure function of (dir, namespace) with a tmpdir test) and therefore cannot
 * resolve this process's own root. It joins the name itself; the name is still
 * written down once.
 *
 * The gateway spells it a fourth time in Go, which cannot import this and is
 * out of the `paths:no-inlined-worktree-artifacts` check's reach.
 */
export const WORKTREE_SPEC_FILE = "spec.json";

/**
 * Canonical on-disk paths for the per-worktree files: the namespace's
 * registration record and its build/release artifacts.
 *
 * THE single source of truth for these filenames: every reader (the profiling /
 * build / release server plugins, and the backend reading back its own spec)
 * and writer (the build/release CLI plus the server-side orphan-recovery
 * fallback) derives its path from here, so a layout change is one edit and
 * readers can never drift from writers.
 *
 * Most entries are FILES, and for those the `id`-less variant is the "most
 * recent / manual CLI" artifact while passing a build/release run id yields the
 * per-run artifact for that run.
 *
 * Three entries are DIRECTORIES rather than files. `runsDir` is the plain one:
 * it is where the supervised-run family lives, and it has a directory of its
 * own so a watcher can be pointed at it (see {@link runsDirFor}); its contents
 * are ordinary id-keyed files with an ordinary prune.
 *
 * `webDist` and `releaseWebDist` are the odd ones: DIRECTORIES with no run-id
 * variant. Each is a symlink published atomically by
 * `dist-publish.ts` at `<base>` → `<base>.live.<pid>` (with `<base>.staging.*` /
 * `<base>.swap.*` siblings in flight), so the path named here is the stable
 * pointer, never the tree itself. Their cleanup is NOT the file-retention
 * pruner (`pruneWorktreeBuildArtifacts`, which only ever matches the file
 * patterns above): a dist tree is reclaimed by `sweepDistLeftovers` at publish
 * time and, wholesale, by `removeWorktreeSpec`'s recursive remove of
 * `worktreeDataDir(name)` (`infra/worktree/server/internal/spec.ts`).
 */
export const worktreeArtifacts = {
  /**
   * The namespace's registration record — see {@link WORKTREE_SPEC_FILE} for
   * who writes it and who reads it back. Not a build artifact (neither is
   * `buildStatus`), and it has no `<id>` variant: a namespace has exactly one
   * spec, and the file's whole job is to be found at a fixed, watched path.
   */
  spec: (name: Namespace): string =>
    join(worktreeDataDir(name), WORKTREE_SPEC_FILE),
  /** Build profiler spans. `build-profile.json` or `build-profile-<id>.json`. */
  buildProfile: (name: Namespace, buildId?: string): string =>
    join(
      worktreeDataDir(name),
      buildId ? `build-profile-${buildId}.json` : "build-profile.json",
    ),
  /** Structured build transcript. `build-logs.json` or `build-logs-<id>.json`. */
  buildLogs: (name: Namespace, buildId?: string): string =>
    join(
      worktreeDataDir(name),
      buildId ? `build-logs-${buildId}.json` : "build-logs.json",
    ),
  /** Human-readable build transcript. `build.log` or `build-<id>.log`. */
  buildLogText: (name: Namespace, buildId?: string): string =>
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
  buildStatus: (name: Namespace): string =>
    join(worktreeDataDir(name), "build-status.json"),
  /**
   * One check run's full, untruncated transcript. ALWAYS id-keyed (like
   * `runTranscript`, unlike `buildStatus` directly above), and for a reason that
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
  checkLog: (name: Namespace, runId: string): string =>
    join(worktreeDataDir(name), `check-${runId}.log`),
  /**
   * DIRECTORY. Every supervised run's transcript and exit marker, for every
   * kind. See {@link runsDirFor} for why this family gets a directory of its own.
   */
  runsDir: (name: Namespace): string => runsDirFor(name),
  /**
   * One supervised run's merged stdout+stderr transcript.
   *
   * This file IS the stream: the child writes into it through a plain kernel fd
   * and the supervisor publishes to the run's log channel by tailing it, so
   * there is no second, pipe-shaped path that only works while the process that
   * spawned the child is alive. `<kindId>-<runId>.log` — `kindId` first so a
   * kind's runs sort together and its prune can name its own family by prefix.
   */
  runTranscript: (name: Namespace, kindId: string, runId: string): string =>
    join(runsDirFor(name), `${kindId}-${runId}${RUN_TRANSCRIPT_SUFFIX}`),
  /**
   * One supervised run's exit marker: the child's status, and nothing else.
   *
   * Written by the POSIX shim the supervisor wraps every argv in, atomically
   * (tmp + rename) at the one instant the status is known — so recording it is
   * not something a command can forget to do, and its ABSENCE is the honest
   * signal that the child was hard-killed and ran no shell at all.
   *
   * The finish INSTANT is this file's mtime, which is why it holds only the
   * code: a timestamp the shell had to format would be a second thing to get
   * right, in `sh`, for no gain.
   */
  runTerminal: (name: Namespace, kindId: string, runId: string): string =>
    join(runsDirFor(name), `${kindId}-${runId}${RUN_TERMINAL_SUFFIX}`),
  /**
   * DIRECTORY. The web dist SERVED for namespace `name` — the tree the gateway
   * points at for `<name>.localhost:9000`. `name` is a *namespace*: a worktree
   * slug (`singularity`, an agent branch) or an auto-served composition id.
   */
  webDist: (name: Namespace): string => join(worktreeDataDir(name), "web"),
  /**
   * DIRECTORY. A release's scratch web dist — copied into the shippable bundle
   * and served by nobody. Keyed by the worktree that BUILT it (not a namespace:
   * a release has none), so two checkouts releasing the same composition, or one
   * checkout releasing two, can never share a tree.
   *
   * The `asNamespace` below is not a namespace claim — it is the data dir's own
   * grammar. Every subdirectory of `worktrees/` obeys it, checkout name or not.
   */
  releaseWebDist: (worktree: string, composition: string): string =>
    join(worktreeDataDir(asNamespace(worktree)), "release-web", composition),
  /**
   * What this namespace's checkout DECLARES under the data root — the
   * `${kind}/${name}` keys of its `defineDataDir` registry, plus the top-level
   * entries its `legacyLocation` declarations claim.
   *
   * Not a build artifact (neither is `spec`), and deliberately WITHOUT a run-id
   * variant: a namespace has exactly one declared set, and this file's whole job
   * is to be found at a fixed path by an audit running in a DIFFERENT checkout.
   *
   * That cross-checkout read is the point. `~/.singularity/` is host-global —
   * every namespace on this box writes into it — while a checkout's declarations
   * are one branch's view, so `paths:no-undeclared-data-dirs` used to report a
   * directory another live worktree had just declared as an orphan. Each
   * namespace publishing its own set is what makes the rule as host-global as
   * the root it polices.
   *
   * The set must come from the EVALUATED registry, never from parsing the
   * `data-dirs/index.ts` sources: `infra/host-admission` derives one
   * `locks/<id>` declaration per entry of `RESERVED_POOLS`, so a declared name
   * is not always a literal anyone can grep for.
   *
   * Its lifetime is exactly right by construction — `removeWorktreeSpec` already
   * removes `worktreeDataDir(name)` recursively, so the manifest dies with the
   * namespace, i.e. at the moment that namespace stops being able to write to
   * the root.
   */
  dataDirs: (name: Namespace): string =>
    join(worktreeDataDir(name), "data-dirs.json"),
} as const;

/**
 * The built frontend THIS BACKEND is serving — the tree the gateway hands the
 * browser for this backend's namespace. The one source of truth for the runtime
 * readers of the served bundle: the stale-tab signal (`.build-graph`, the
 * bundle's content identity — also what tags a report's originating tab), the
 * "N commits behind main" base (`.build-commit`) and the producing run
 * (`.build-id`).
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
