/**
 * An updater: how one kind of pinned input moves to newer releases — the mise
 * toolchain (`mise.lock`), every `python/` project's `uv.lock`, later
 * `bun.lock`. The generic runner (`runUpgrade`) owns everything around the move:
 * the gates before and after, retry-to-confirm, the verdict, putting the files
 * back on a regression, the task text and the push permission. An updater only
 * says what is outdated, what to move, how to move it, and what extra smoke
 * tests the moved things must pass.
 */

/** One command a moved input must still pass, beyond the check and test suites. */
export interface UpdaterSmoke {
  /** Stable name — the identity a failure is compared by, before and after. */
  name: string;
  argv: readonly string[];
  /** Repo-relative working directory; the repo root when omitted. */
  cwd?: string;
  /** Extra environment on top of the gates' own. */
  env?: Readonly<Record<string, string>>;
  timeoutMs: number;
}

/** Something newer than what the lock records, as the daily detection sees it. */
export interface Outdated {
  name: string;
  /** `null` when nothing is recorded yet (a newly declared tool). */
  current: string | null;
  latest: string;
}

/** One input the upgrade moves. `from` is `null` for an input added fresh. */
export interface Move {
  name: string;
  from: string | null;
  to: string;
}

/** A release not to move to, with the upstream issue that makes it broken. */
export interface UpdaterHold {
  name: string;
  version: string;
  reason: string;
  /** Upstream issue or report URL. */
  issue: string;
}

export interface Updater {
  /** Stable id: `./singularity deps upgrade <id>`, the receipt name, the task author. */
  readonly id: string;
  /** One line: what it keeps current. */
  readonly description: string;
  /**
   * The repo-relative files `apply` may rewrite. The runner snapshots them
   * before the move and puts them back on any outcome but `upgraded`.
   */
  files(root: string): Promise<readonly string[]>;
  /**
   * Work before planning that is part of the upgrade but has no lock entry (mise
   * updates itself). Returns notes recorded on the receipt.
   */
  prepare?(
    root: string,
    log: (line: string) => void,
  ): Promise<Readonly<Record<string, string>>>;
  /**
   * The daily, read-only question asked on main: is anything newer (and not
   * held)? Installs nothing, moves nothing.
   */
  detect(root: string): Promise<Outdated[]>;
  /**
   * The exact moves an upgrade would make now, restricted to `only` (names this
   * updater knows; an unknown one throws). Read-only.
   */
  plan(root: string, only: readonly string[] | undefined): Promise<Move[]>;
  /** Make the moves in `root`'s files. Throws on any failure. */
  apply(
    root: string,
    moves: readonly Move[],
    log: (line: string) => void,
  ): Promise<void>;
  /** The smoke tests the moved inputs must pass, run before and after the move. */
  smoke(root: string, moves: readonly Move[]): Promise<readonly UpdaterSmoke[]>;
  /** Releases skipped on purpose, and where the agent adds one. */
  readonly holds: {
    readonly entries: readonly UpdaterHold[];
    /** Repo-relative file holding the entries. */
    readonly file: string;
  };
}
