import type { RunTerminal } from "@plugins/infra/plugins/jobs/plugins/supervised-run/core";

/**
 * A **leg**: one spawned `./singularity deploy` command inside one deploy run.
 *
 * A run and a leg are not the same thing, and this file exists because the
 * supervised-run primitive names legs while everything else here names runs. A
 * `converge` or a `ship` is one leg; an `update` is two legs with an in-process
 * release build between them (the build leg spawns nothing of its own — it
 * awaits the release engine — so it is a phase, never a leg).
 *
 * Each leg needs its own supervised-run id because each gets its own transcript
 * and its own exit marker, and the primitive refuses to reuse an id whose marker
 * already exists. So the leg id is `<runId>.<leg>`, which the run id itself can
 * never contain (`drun-<ms>-<rand>`) and which `assertRunId` accepts unchanged.
 */
export type DeployLeg = "converge" | "ship";

/**
 * `.` rather than `-`, because a run id is already full of dashes: with a dot
 * the last separator is unambiguously the run/leg boundary, so
 * {@link parseLegRunId} is a parse rather than a guess.
 */
const LEG_SEPARATOR = ".";

const LEGS: readonly DeployLeg[] = ["converge", "ship"];

/** The supervised-run id of one leg of `runId`. */
export function legRunId(runId: string, leg: DeployLeg): string {
  return `${runId}${LEG_SEPARATOR}${leg}`;
}

/**
 * Split a leg id back into the run it belongs to and the leg it names, or null
 * when the string is not one.
 *
 * Null is a legitimate answer rather than a failure: the caller reads leg ids
 * out of the ledger, and a row written by a future version of this file (or by
 * hand) must not take the reconciler down with it.
 */
export function parseLegRunId(
  id: string,
): { runId: string; leg: DeployLeg } | null {
  const at = id.lastIndexOf(LEG_SEPARATOR);
  if (at <= 0) return null;
  const leg = id.slice(at + 1);
  if (!LEGS.includes(leg as DeployLeg)) return null;
  return { runId: id.slice(0, at), leg: leg as DeployLeg };
}

/**
 * The sequencers waiting on a leg, keyed by leg id.
 *
 * **This is the whole answer to the control-flow inversion**, so it is worth
 * stating plainly. A supervised run's outcome does not come back from the call
 * that started it — it arrives later, at the kind's `finish` callback, driven by
 * a file watcher. Read literally that turns `runUpdate`'s three ordered legs
 * into a callback machine, which is a lot of new shape for a sequence that has
 * not changed.
 *
 * It does not have to. `finish` is *an* arrival, not necessarily the only
 * interested party: when this process is the one that started the leg, it is
 * still here and still knows what comes next, so the outcome is handed to it and
 * `runUpdate` stays the straight-line async function it was. When this process
 * is NOT the one that started the leg — it restarted, and the reconciler adopted
 * an orphan — there is no entry here, `deliverLeg` says so, and the kind closes
 * the row from the ledger alone. One map, and the two cases stop being two
 * shapes of code.
 *
 * In-memory on purpose: a waiter IS a live promise in this process, so it cannot
 * mean anything durable. Its absence is the honest signal that the sequencer is
 * gone.
 */
const waiters = new Map<string, (terminal: RunTerminal) => void>();

/**
 * Run one leg and wait for its outcome.
 *
 * `start` is taken as a thunk rather than awaited by the caller beforehand,
 * because the waiter has to be registered BEFORE the spawn: a leg that finishes
 * immediately (a CLI that refuses in milliseconds) settles inside
 * `startSupervisedRun` itself, which closes the subscribe race by reading the
 * marker one extra time. Registering afterwards would drop that outcome and hang
 * the sequence forever. Passing the thunk in makes that ordering unspellable
 * rather than a comment somebody has to keep obeying.
 *
 * A `start` that throws unregisters the waiter and rethrows: the returned
 * promise is then discarded unsettled, which is correct — nothing was spawned,
 * so nothing will ever finish it.
 */
export async function runLeg(
  legId: string,
  start: () => Promise<unknown>,
): Promise<RunTerminal> {
  if (waiters.has(legId)) {
    throw new Error(
      `[deploy] leg ${legId} is already being awaited — a leg id must name one spawn.`,
    );
  }
  const terminal = new Promise<RunTerminal>((resolve) => {
    waiters.set(legId, resolve);
  });
  try {
    await start();
  } catch (err) {
    waiters.delete(legId);
    throw err;
  }
  return terminal;
}

/**
 * Hand a leg's outcome to the sequencer that started it.
 *
 * Returns false when nobody is waiting, which is the caller's signal that this
 * process did not start the leg (see the `waiters` docblock) and must close the
 * run from the ledger instead.
 */
export function deliverLeg(legId: string, terminal: RunTerminal): boolean {
  const resolve = waiters.get(legId);
  if (resolve === undefined) return false;
  waiters.delete(legId);
  resolve(terminal);
  return true;
}

/**
 * The runs this process is sequencing — claimed before the first leg, released
 * only once the run's outcome is stamped.
 *
 * Distinct from {@link waiters}, which is per LEG and per spawn, and needed
 * because the interesting window is the one where neither is true: an `update`
 * between its converge and its ship spends *minutes* in an in-process release
 * build, with its ledger row legitimately open and no leg awaited. The primitive
 * reconciles every unfinished row on a timer, so without this the reconciler
 * would reach that row, find nobody waiting, and close a run that is going
 * perfectly well as an interrupted one.
 *
 * It also covers the millisecond between a leg's outcome being delivered and the
 * sequencer's own `finishRun` committing — the same race, three orders of
 * magnitude narrower.
 *
 * In-memory for the same reason the waiters are: it means "a live sequencer in
 * THIS process", so its absence after a restart is exactly the fact the adopting
 * path needs.
 */
const driving = new Set<string>();

/** Claim a run for this process's sequencer. Paired with {@link endDriving}. */
export function beginDriving(runId: string): void {
  driving.add(runId);
}

/** Release it — after the run's outcome has been stamped, never before. */
export function endDriving(runId: string): void {
  driving.delete(runId);
}

/** Is a sequencer in this process still responsible for this run's outcome? */
export function isDriving(runId: string): boolean {
  return driving.has(runId);
}
