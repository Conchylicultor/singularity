import { mkdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
// Relative sibling import: this file lives INSIDE the `paths` plugin, so the
// `@plugins/infra/plugins/paths/core` alias would cycle back through the barrel
// that re-exports it.
import { resolveDataRoot } from "./paths";

// The declared-directory registry for `~/.singularity/`.
//
// The root used to be a shared mutable namespace with no owner and no reader:
// `SINGULARITY_DIR` was a plain string and ~37 call sites across ~30 plugins
// wrote `join(SINGULARITY_DIR, "<whatever>")`. Nothing ever read the directory
// as a whole, so nine orphaned entries (~1 GB) accumulated with zero references
// left in the repo, ten `<name>-slots` dirs were minted by ONE primitive, and
// ~7 GB of pure cache sat indistinguishable from the only copy of a secret.
//
// `defineDataDir` makes each directory a declaration with an owner, a purpose
// and a reclaim policy, keyed under a CLOSED set of top-level kinds. The
// registry is then enumerable, which is what lets `paths:no-undeclared-data-dirs`
// diff the real filesystem against it and fail on the next orphan on the day it
// appears rather than a year later.
//
// Node-only (`node:fs` + `node:path`), like the rest of this plugin's `core/`:
// runtime-neutral, never importable from `web/`.

/**
 * The closed set of top-level kinds under the data root. Everything the app
 * writes is exactly one of these, and the kind is the answer to "may I delete
 * this whole subtree?" that `du` can never give you.
 *
 * - `apps` — user content owned by one app (prototypes, wallpapers, attachments)
 * - `worktrees` — the existing per-worktree layout, unchanged
 * - `services` — long-lived service state (postgres, sockets, …)
 * - `state` — durable app state that is the only copy (config, secrets, releases)
 * - `cache` — rebuilt on demand; the whole kind is reclaimable wholesale
 * - `locks` — cross-process lock/slot files; reclaimable once nothing is running
 * - `logs` — append-only observability output
 * - `deprecated` — quarantine for entries with no live owner
 *
 * Adding a kind is a reviewed edit to this array — that is the point. A kind is
 * a reclaim class, not a folder someone felt like making.
 */
export const DATA_DIR_KINDS = [
  "apps",
  "worktrees",
  "services",
  "state",
  "cache",
  "locks",
  "logs",
  "deprecated",
] as const;

export type DataDirKind = (typeof DATA_DIR_KINDS)[number];

/**
 * What it costs to delete this directory — the fact a size listing cannot carry.
 *
 * A discriminated union rather than a boolean because the interesting cases are
 * not "safe / unsafe": a slot dir is safe once the cluster stops but not while
 * it runs, and a release-bundle dir is safe for every group except the newest
 * few. Collapsing those into one flag is how a cache becomes indistinguishable
 * from the only copy of something.
 */
export type ReclaimPolicy =
  /** Rebuilt on demand; `rm -rf` costs nothing but a re-derivation. */
  | { kind: "safe" }
  /** Safe once the owning service stops — live handles/locks live here. */
  | { kind: "restart" }
  /** The only copy: user content, secrets. Never reclaim. */
  | { kind: "never"; reason: string }
  /** Keep the newest `keep` run-id groups; older groups are reclaimable. */
  | { kind: "keep"; keep: number }
  /** Reclaimable once older than `ttlDays`. */
  | { kind: "ttl"; ttlDays: number };

export interface DataDirSpec {
  kind: DataDirKind;
  /**
   * The ONE caller-supplied path segment. Must match `/^[a-z0-9][a-z0-9-]*$/`,
   * so a name can never contain a separator and mint a nested namespace behind
   * the registry's back.
   */
  name: string;
  /** Owning plugin path, e.g. `"framework/tooling/checks"`. */
  owner: string;
  /** What lives here, in one line — rendered by the audit surface. */
  description: string;
  reclaim: ReclaimPolicy;
  /**
   * Physically NOT under `<kind>/`. Set ONLY for grandfathered entries whose
   * move would require stopping something that cannot be stopped cheaply (the
   * live services: postgres, sockets, zero, node). Carries the reason, and the
   * undeclared-data-dirs check honours it instead of demanding the entry move.
   *
   * `path` is **relative to the data root**, never absolute. Two reasons, both
   * load-bearing: an absolute literal would be frozen at module eval and so
   * would not follow `SINGULARITY_DIR` (see {@link dataRoot}), and it would
   * have to spell out the home directory, which `paths:no-hardcoded-paths`
   * bans outright.
   */
  legacyLocation?: { path: string; reason: string };
}

export interface DataDir {
  readonly spec: DataDirSpec;
  /**
   * The absolute directory. A GETTER, resolved on every read — never a value
   * frozen at declaration time. See {@link dataRoot}.
   */
  readonly path: string;
  /** A path INSIDE this directory. The only sanctioned way to name a child. */
  file(...segments: string[]): string;
  /** `mkdir -p` the directory, and return its path. */
  ensure(): string;
}

// A name is ONE path segment, lowercase-kebab. Same regex (and same
// throw-on-violation discipline) as `createHostSemaphore`'s pool name, since
// both end up as a literal directory name on disk.
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * The data root ITSELF.
 *
 * Its ONE legitimate use is handing the root to a child process as its
 * `SINGULARITY_DIR` (the gateway spawn, a release launch, a remote deploy's
 * env line). `join(dataRoot(), …)` is exactly what `defineDataDir` exists to
 * replace — a joined root is an undeclared directory, which is the failure mode
 * this whole registry is here to make impossible.
 *
 * A FUNCTION, not a const, and its result must not be cached by a caller:
 * `SINGULARITY_DIR` is env-overridable and the release launcher sets it before
 * importing anything path-dependent, so a value frozen at module eval captures
 * whatever the environment said when that module was FIRST imported. This is
 * the same reasoning that made `webDistDir()` a function — see its docblock in
 * `./paths.ts`; the const form there is what once made a release report a null
 * build id. `defineDataDir` runs at consumer module eval, which is earlier
 * still, so freezing here would be strictly worse.
 */
export function dataRoot(): string {
  return resolveDataRoot();
}

/**
 * Where a declared directory — or a file inside it — sits RELATIVE to the data
 * root: `relativeToDataRoot(gatewayLocks, "gateway.pid")` is
 * `"locks/gateway/gateway.pid"`.
 *
 * For the callers that must name a declared location under a root that is NOT
 * this process's own: teardown killing a release preview's gateway under its
 * `/tmp/sgp-XXXXXX` data dir, a release bundle seeding config into a freshly
 * installed app's data dir, the asset-mirror seed. They cannot read `.path`,
 * which resolves against THIS process's root — but they must not spell the
 * location a second time either, because a hand-written copy goes on naming the
 * old spot after a layout change moves the real one. That failure is silent by
 * construction: the seed lands where nothing reads it, the preview's gateway
 * becomes un-killable.
 *
 * Takes a {@link DataDir}, not a path, so it cannot be used to relativise an
 * arbitrary string — the only thing worth expressing relative to the root is
 * something the registry already owns. This replaced three hand-written copies
 * of `relative(dataRoot(), …)`, one per calling plugin, which were the only
 * recurring reason a file outside this plugin called `dataRoot()` at all.
 */
export function relativeToDataRoot(
  dir: DataDir,
  ...segments: string[]
): string {
  return relative(dataRoot(), dir.file(...segments));
}

function makeDataDir(spec: DataDirSpec): DataDir {
  // Resolved per call, never closed over as a value — see `dataRoot()`.
  const resolvePath = (): string =>
    spec.legacyLocation
      ? join(dataRoot(), spec.legacyLocation.path)
      : join(dataRoot(), spec.kind, spec.name);

  return {
    spec,
    get path(): string {
      return resolvePath();
    },
    file(...segments: string[]): string {
      return join(resolvePath(), ...segments);
    },
    ensure(): string {
      const path = resolvePath();

      // A `DataDir` names a DIRECTORY. Several entries at the root are loose
      // FILES today (`duress.latch`, `gateway.pid`, `push-holder.json`, the
      // `*.jsonl` sinks), and pointing a declaration's `legacyLocation` at one
      // of those is a trap: `mkdirSync` would try to create a DIRECTORY where
      // the file is, and the owner's next write would fail with EISDIR — far
      // from the declaration that caused it. Such an entry belongs INSIDE a
      // declared dir, reached via `file()`; say so here rather than let the
      // raw EEXIST surface with no explanation of what to do about it.
      const existing = statSync(path, { throwIfNoEntry: false });
      if (existing && !existing.isDirectory()) {
        throw new Error(
          `[data-dir] ${spec.kind}/${spec.name} (owner ${spec.owner}) resolves to ${path}, which exists and is NOT a directory. ` +
            `A DataDir names a directory; a single file belongs inside one — declare the containing dir and reach the file with .file("<name>").`,
        );
      }

      // A genuinely unwritable data root is a real fault and should surface
      // loudly rather than be swallowed into a silent no-write.
      mkdirSync(path, { recursive: true });
      return path;
    },
  };
}

// `${kind}/${name}` → dir. Module-level ⇒ process-global; populated as a side
// effect of the declaring calls at consumer module eval (each owner's
// `data-dirs/index.ts`, loaded through the `data-dirs` collected dir).
const dataDirs = new Map<string, DataDir>();

/**
 * Declare a directory under the data root.
 *
 * Mirrors `defineFileSink`'s exactly-once discipline: a directory is declared
 * EXACTLY ONCE, so ANY re-declaration of the same `${kind}/${name}` throws.
 * Deliberately NOT `defineHostPool`'s dedup-if-identical rule — two owners
 * claiming one directory is always a bug, and silently keeping the first
 * declaration would hide precisely the shared-mutable-namespace problem this
 * registry exists to end.
 */
export function defineDataDir(spec: DataDirSpec): DataDir {
  if (!NAME_RE.test(spec.name)) {
    throw new Error(
      `[data-dir] name must match ${String(NAME_RE)}, got ${JSON.stringify(spec.name)}. ` +
        `A data-dir name is ONE lowercase path segment — nest by declaring a second dir, not by embedding a separator.`,
    );
  }

  const key = `${spec.kind}/${spec.name}`;
  const existing = dataDirs.get(key);
  if (existing) {
    throw new Error(
      `[data-dir] "${key}" is already declared by ${existing.spec.owner} ` +
        `(${existing.spec.description}); a data dir is declared exactly once. ` +
        `Attempted to re-declare it from ${spec.owner}. ` +
        `Two owners claiming one directory is a bug — pick a distinct name, or import the existing declaration.`,
    );
  }

  const dir = makeDataDir(spec);
  dataDirs.set(key, dir);
  return dir;
}

/**
 * A copy of the registry — callers never hold the live map. Keyed
 * `${kind}/${name}`.
 *
 * Its consumer is `paths:no-undeclared-data-dirs`, which diffs it against the
 * real filesystem, and (later) the audit surface and reclaim-driven cleanup.
 * Only complete once every owner's `data-dirs/index.ts` has been loaded — the
 * declarations are side effects of those modules' evaluation.
 */
export function getDataDirs(): ReadonlyMap<string, DataDir> {
  return new Map(dataDirs);
}

/**
 * Is this default export from a `data-dirs/index.ts` really a {@link DataDir}?
 *
 * Lives beside the type it validates, not in one caller: both consumers of the
 * `data-dirs` collected dir — the audit check and the backend publishing its
 * namespace's manifest — must agree on what counts, and a second hand-written
 * copy is how one of them silently starts accepting or rejecting a shape the
 * other does not.
 */
export function isDataDir(value: unknown): value is DataDir {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<DataDir>;
  const spec = candidate.spec as Partial<DataDirSpec> | undefined;
  return (
    typeof spec === "object" &&
    spec !== null &&
    typeof spec.kind === "string" &&
    typeof spec.name === "string" &&
    typeof spec.owner === "string" &&
    typeof candidate.file === "function" &&
    typeof candidate.ensure === "function"
  );
}
