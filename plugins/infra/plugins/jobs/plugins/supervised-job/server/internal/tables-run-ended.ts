import { text } from "drizzle-orm/pg-core";
import { defineTriggerEvent } from "@plugins/infra/plugins/events/server";

/**
 * What `supervisedRun.ended` carries: WHICH run ended, and nothing else.
 *
 * **The outcome is deliberately absent, and that absence is the design.** The
 * authority on how a run ended is the exit marker the shim wrote next to the
 * transcript — a file that exists whether or not any backend was alive to
 * announce it. An event is a wake-up: it may never arrive (the process died
 * between the marker landing and the emit), it may arrive for a run whose row
 * some CLI stamped minutes ago, and it may arrive twice. A payload carrying
 * `exitCode` would be a second, weaker source of the same fact sitting in easy
 * reach of every consumer, and the first reader to trust it would reintroduce
 * exactly the class of bug `RunTerminal.signalCode` exists to close. So the
 * wrong thing has no spelling: there is nothing here to trust but the identity
 * of the run, and the reader must go and read the marker.
 *
 * The index signature is what makes this assignable to the event plugin's
 * `Record<string, unknown>` payload bound (`RefAdvancedPayload` does the same).
 */
export interface RunEndedPayload {
  /** The supervised-run kind id — `build`, `release`, `deploy`, … */
  kindId: string;
  /** The run id, unique within the kind. */
  runId: string;
  [key: string]: unknown;
}

/**
 * "A supervised run of kind K, id R, has ended."
 *
 * Filtered on both halves of the identity so a waiting workflow subscribes to
 * ITS run rather than to every run of every kind — a build's wake-up must not
 * cost a dispatch for each of the ~16 backends' deploys.
 *
 * Emitted by the supervised-run kind that `defineSupervisedJob` builds (its
 * `finish` does nothing else), and awaited by the job handler that spawned the
 * run. It is exported because a workflow that did not spawn the run may also
 * wait on it — deploy's `update` enqueues a release job and then waits for that
 * release's run to end, which is the same event with a different `kindId`.
 */
export const { event: runEnded, table: _supervisedRunEndedTriggers } =
  defineTriggerEvent<RunEndedPayload>({
    name: "supervisedRun.ended",
    filters: {
      kindId: text("kind_id"),
      runId: text("run_id"),
    },
  });
