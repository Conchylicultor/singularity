/**
 * Proof that the code holding it runs OUTSIDE a serving backend's event loop.
 *
 * Some work must never run on a backend's event loop: a 500 MB download, a
 * `uv sync`, anything that holds a host lock for minutes. A function that does
 * such work takes an `ExecContext` parameter, and the only places that can
 * produce one are the out-of-process contexts:
 *
 * - a supervised job's `run` body (`SupervisedRunContext.exec`), which runs in
 *   its own `./singularity supervised-exec` child;
 * - a `./singularity` CLI command (`cliExecContext`, exported from this
 *   plugin's `cli` barrel — a `server/` file cannot import a `cli` barrel, so a
 *   request handler has no spelling of it).
 *
 * A request handler has none, so it cannot spell the call: the Chromium
 * regression (a thumbnail render downloading 150 MB on the event loop) is a
 * type error rather than a review comment.
 *
 * The brand is a module-private `unique symbol`, so nothing outside this file
 * can construct the type by hand.
 */
declare const execContextBrand: unique symbol;

export interface ExecContext {
  readonly [execContextBrand]: true;
  /** Which out-of-process context minted it — for logs and error messages. */
  readonly origin: "supervised-run" | "cli";
}

function mint(origin: ExecContext["origin"]): ExecContext {
  // The brand exists only in the type system; at runtime it is a plain object.
  return { origin } as ExecContext;
}

/** Minted by a supervised job's run body, in its own child process. */
export function supervisedRunExecContext(): ExecContext {
  return mint("supervised-run");
}

/** Minted by a `./singularity` CLI command — a process of its own. */
export function cliExecContext(): ExecContext {
  return mint("cli");
}
