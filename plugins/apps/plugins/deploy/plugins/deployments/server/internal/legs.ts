import type { DeployVerb } from "../../core/runs";

/**
 * A **leg**: one spawned `./singularity deploy` command inside one deploy run.
 *
 * A run and a leg are not the same thing, and this file exists because the
 * supervised-run primitive names legs while everything else here names runs. A
 * `converge` or a `ship` is one leg; an `update` is two legs with a release
 * build between them (that build spawns nothing of its own here — it is another
 * plugin's job, waited on durably — so it is a phase, never a leg).
 *
 * Each leg needs its own supervised-run id because each gets its own transcript
 * and its own exit marker, and the primitive refuses to reuse an id whose marker
 * already exists. So the leg id is `<runId>.<leg>`, which the run id itself can
 * never contain (`drun-<ms>-<rand>`) and which `assertRunId` accepts unchanged.
 *
 * **This file used to hold two in-memory maps as well** — `waiters`, keyed per
 * leg, and `driving`, keyed per run — and both are gone. They existed because a
 * supervised leg's outcome arrived at the kind's `finish` rather than at the
 * call that started it, and because an `update` spent minutes between its legs
 * awaiting a release in-process with nothing durable to resume from. The
 * sequence is a job now: `ctx.step` remembers which legs have been spawned and
 * `ctx.waitFor` is the wait, so "who is sequencing this run" stopped being a
 * question about which process is alive.
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

/** Which leg a verb spawns first. An `update` always converges before it ships. */
export function firstLeg(verb: DeployVerb): DeployLeg {
  return verb === "ship" ? "ship" : "converge";
}

/**
 * Which leg a verb ENDS on — the one whose outcome is the run's own.
 *
 * This is what lets the ledger be closed from the leg alone, with no in-memory
 * "is somebody sequencing this run" flag: a leg that succeeded and is not the
 * last one (an `update`'s converge) leaves the run open, because more is coming;
 * every other ending is terminal for the run. Derived from the verb, which the
 * row carries, so the reconciler in a backend that knows nothing about the
 * workflow can answer it.
 */
export function finalLeg(verb: DeployVerb): DeployLeg {
  return verb === "converge" ? "converge" : "ship";
}
