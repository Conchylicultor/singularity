import type { ExecContext } from "@plugins/infra/plugins/jobs/plugins/supervised-job/core";
import type { DepUpdates } from "../../core";

/**
 * What an installer kind hands `install`: the checkout the declaration lives
 * in, the directory to fill, and the engine's logging.
 */
export interface InstallContext {
  /** The checkout whose declaration derived this identity (its repo root). */
  readonly root: string;
  /**
   * The directory to fill. It does not exist yet (a partial one from an
   * interrupted install has been removed). The kind creates it.
   */
  readonly dir: string;
  /** One line to the caller's log (a job transcript, the terminal). */
  readonly log: (line: string) => void;
  /**
   * Run one command with its stdout and stderr appended to the install log as
   * they are written, so `depState`'s `logTail` follows a long install. Throws
   * on a non-zero exit, naming the command and the log's tail.
   */
  readonly run: (
    argv: readonly string[],
    opts: {
      cwd: string;
      env: Record<string, string | undefined>;
      timeoutMs: number;
    },
  ) => Promise<void>;
  readonly exec: ExecContext;
}

/**
 * An installer kind's contribution for one declared source: an open set of
 * sub-plugins under `infra/deps/plugins/<kind>` (this task ships `python`).
 */
export interface DepSource<K extends string = string> {
  readonly kind: K;
  /** What it installs from, for people: the uv project's path, a URL, … */
  readonly label: string;
  /**
   * The declared inputs this install is a function of — lock hash, source
   * hash, pinned URL + sha256, plus the installer's own version — derived, never
   * typed in by hand. The engine hashes them into the identity, so a change in
   * any of them is a new identity and so a new install.
   *
   * `root` is the checkout to read the inputs from: the running one, or (for
   * the sweep) any other checkout on the machine. Throws when an input cannot
   * be read (the installer is missing) — never a stand-in value.
   */
  identityInputs(root: string): Promise<Readonly<Record<string, string>>>;
  /** Fill `ctx.dir`. Throws on any failure; the engine records it. */
  install(ctx: InstallContext): Promise<void>;
  /**
   * Whether an installed payload is still whole — for a payload that points
   * outside itself (a venv's `bin/python` is a symlink into uv's managed
   * Pythons, a reclaimable cache). Cheap and synchronous: it runs on every
   * `ensureDep` fast path and every state read. An install that is no longer
   * intact reads as `absent` and is installed again. Omitted: always intact.
   */
  isIntact?(dir: string): boolean;
  /**
   * The updater that moves this source's declared inputs to newer releases
   * (`uv` for a Python project). A kind that has one makes `updates` implied.
   */
  readonly updater?: string;
}

/** How a declaration states it stays current when its source has no updater. */
type UpdatesSpec<S extends DepSource> = S extends { readonly updater: string }
  ? { updates?: never }
  : {
      /**
       * Required: a dependency says how it stays current. A source with no
       * updater (a dataset pinned to a commit) must say why it is frozen, so
       * being frozen is a visible decision, never an omission.
       */
      updates: { none: string };
    };

export type DefineDepSpec<S extends DepSource> = {
  /** Stable id: the cache dir name and the CLI argument. `^[a-z][a-z0-9-]*$`. */
  id: string;
  /** The declaring plugin's path, e.g. `infra/deps/hello-python`. */
  owner: string;
  description: string;
  /** A human estimate of the install's size, e.g. `≈40 MB`. */
  sizeHint: string;
  source: S;
} & UpdatesSpec<S>;

/** A declared dependency. Created only by {@link defineDep}. */
export interface Dep<S extends DepSource = DepSource> {
  readonly id: string;
  readonly owner: string;
  readonly description: string;
  readonly sizeHint: string;
  readonly source: S;
  readonly updates: DepUpdates;
}

const DEP_ID = /^[a-z][a-z0-9-]*$/;

/**
 * Declare a dependency: installed on demand (`ensureDep` / `requestDep`), into
 * a content-addressed host-wide cache, with its state visible (`depState`, the
 * `deps.states` live value) and its way of staying current stated.
 *
 * Declaring it is not registering it: list it as `DepDeclare({ dep })` in the
 * declaring plugin's server `contributions`, which is what puts it in the
 * Dependencies view, the CLI and the sweep's set.
 */
export function defineDep<S extends DepSource>(spec: DefineDepSpec<S>): Dep<S> {
  if (!DEP_ID.test(spec.id)) {
    throw new Error(
      `defineDep: id ${JSON.stringify(spec.id)} must match ${DEP_ID} — it names a cache directory and a CLI argument.`,
    );
  }
  const updater = spec.source.updater;
  const frozen = (spec as { updates?: { none: string } }).updates;
  const updates: DepUpdates =
    updater !== undefined
      ? { kind: "updater", updater }
      : { kind: "none", reason: requireReason(spec.id, frozen) };
  return {
    id: spec.id,
    owner: spec.owner,
    description: spec.description,
    sizeHint: spec.sizeHint,
    source: spec.source,
    updates,
  };
}

function requireReason(
  id: string,
  frozen: { none: string } | undefined,
): string {
  // Unreachable through the types; kept for an untyped caller.
  if (frozen === undefined || frozen.none.trim() === "") {
    throw new Error(
      `defineDep(${id}): its source has no updater, so it must say why it is frozen: updates: { none: "<reason>" }.`,
    );
  }
  return frozen.none;
}

declare const readyBrand: unique symbol;

/**
 * Proof that a dependency is installed: returned only by `ensureDep`. Runners
 * (`runPython`) take it as an argument, so "forgot to ensure" is a type error.
 */
export interface Ready<S extends DepSource = DepSource> {
  readonly [readyBrand]: true;
  readonly dep: Dep<S>;
  /** The installed payload (`<cache>/<id>/<identity>/env`). */
  readonly dir: string;
  readonly identity: string;
}

/** The engine's one mint of a `Ready`. Not exported from the barrel. */
export function mintReady<S extends DepSource>(
  dep: Dep<S>,
  dir: string,
  identity: string,
): Ready<S> {
  return { dep, dir, identity } as Ready<S>;
}
