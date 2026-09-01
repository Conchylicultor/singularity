import type { RunTerminal } from "@plugins/infra/plugins/jobs/plugins/supervised-run/core";

/**
 * The runs whose outcome a sequencer **in this process** owns, each holding the
 * resolver of the promise that sequencer is awaiting.
 *
 * **This is the whole answer to the control-flow inversion**, so it is worth
 * stating plainly. A supervised run's outcome does not come back from the call
 * that starts it — it arrives later, at the kind's `finish` callback, driven by
 * a file watcher. Read literally that would turn `runRelease` into a callback
 * machine, when its whole contract is that it is awaitable: the Deploy app's
 * `update` awaits it between `converge` and `ship`.
 *
 * It does not have to. `finish` is *an* arrival, not necessarily the only
 * interested party: when this process is the one that started the run, it is
 * still here and still knows what to do with the outcome, so the outcome is
 * handed to it and `runRelease` stays a straight-line async function. When this
 * process is NOT the one that started it — the backend restarted and the
 * reconciler adopted an orphan — there is no entry here, {@link deliverTerminal}
 * says so, and the kind closes the row from the ledger alone.
 *
 * **The entry outlives the delivery**, released only once the sequencer has
 * stamped the row. That is deliberate and it is what deploy needs two structures
 * (`waiters` + `driving`) to express: between handing over the terminal and the
 * `UPDATE` committing, the row is still open and a second reconcile pass would
 * otherwise find no waiter, conclude the run was orphaned, and close it with the
 * adopted wording. Here a run is one spawn, so "who is awaiting this" and "who
 * owns this outcome" are the same question and one map answers both.
 *
 * In-memory on purpose: it means "a live sequencer in THIS process", so its
 * absence after a restart is exactly the fact the adopting path needs.
 */
const driving = new Map<string, (terminal: RunTerminal) => void>();

/**
 * Claim this run's outcome for this process, and hand back the promise its
 * terminal will arrive on.
 *
 * **Call this BEFORE spawning.** A run that finishes immediately (a CLI that
 * refuses in milliseconds) settles inside `startSupervisedRun` itself, which
 * closes the watcher-subscribe race by reading the exit marker one extra time.
 * Claiming afterwards would drop that outcome and hang the sequence forever.
 */
export function beginDriving(runId: string): Promise<RunTerminal> {
  if (driving.has(runId)) {
    throw new Error(
      `[release] run ${runId} is already being driven — a run id must name one spawn.`,
    );
  }
  return new Promise<RunTerminal>((resolve) => {
    driving.set(runId, resolve);
  });
}

/**
 * Release the claim — after the row has been stamped, whichever way it went.
 * Releasing earlier would hand a run this process is still finishing to the
 * reconciler; not releasing at all would leave a finished run's id in a map that
 * only ever grows.
 */
export function endDriving(runId: string): void {
  driving.delete(runId);
}

/**
 * Hand a run's outcome to the sequencer that started it.
 *
 * Returns false when nobody is driving it, which is the caller's signal that
 * this process did not start the run and must close it from the ledger instead.
 * Resolving twice is harmless — the promise is already settled — which is what
 * makes it safe to keep the entry until {@link endDriving}.
 */
export function deliverTerminal(runId: string, terminal: RunTerminal): boolean {
  const resolve = driving.get(runId);
  if (resolve === undefined) return false;
  resolve(terminal);
  return true;
}
