import type { Registration } from "@plugins/framework/plugins/central-core/core";
import { defineBackgroundKind } from "@plugins/infra/plugins/background/plugins/catalog/central";
import {
  defineTimerIn,
  listTimerEntries,
  timerRecentRuns,
  type Timer,
  type TimerSpec,
} from "../../shared/timer";

/** The central runtime's timer kind. A distinct kind from the worktree's
 * `timer`, so an entry's identity says which process runs it. */
export const centralTimersBackgroundKind = defineBackgroundKind({
  kind: "central-timer",
  order: 20,
  label: "Timers (central)",
  list: () => Promise.resolve(listTimerEntries()),
  recentRuns: timerRecentRuns,
});

/**
 * Declare an in-process interval on the central runtime — which has no job
 * queue, so a periodic task there (refreshing OAuth tokens) is a timer. Same
 * contract as the server's `defineTimer`; its entries land in the central half
 * of Background activity. A throwing tick is recorded as failed and logged:
 * central has no reports funnel, and an unhandled rejection would take the
 * machine-wide process down.
 */
export function defineTimer(spec: TimerSpec): Timer & Registration {
  return defineTimerIn(spec, {
    scope: "central",
    runsHere: true,
    // Central's register phase does not say which plugin is registering.
    declaredIn: () => null,
    onFailure: (name, err) => {
      console.error(`[timer] central timer ${name} failed`, err);
    },
    changed: (name) => centralTimersBackgroundKind.changed(name),
  });
}
