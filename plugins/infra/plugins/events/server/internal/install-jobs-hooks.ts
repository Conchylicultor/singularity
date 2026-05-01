// Installs the events-side implementation of the durable hooks that
// @plugins/jobs exposes. Lives here (not in the jobs plugin) to preserve
// the plugin DAG — events already imports jobs, so the reverse edge would
// close the cycle.
import { UNSAFE_installDurableHooks } from "@plugins/infra/plugins/jobs/server";
import type { EventSource } from "./event";
import { UNSAFE_triggerByName } from "./trigger";

export const jobsHooksRegistration = UNSAFE_installDurableHooks({
  registerTrigger: async (spec) => {
    // The jobs plugin types `spec.event` loosely (a duck-typed
    // `EventSourceLike` brand). At runtime it IS a real `EventSource` —
    // it came from `defineTriggerEvent` — so the cast is a typing-only
    // bridge across the plugin boundary, not a runtime narrowing.
    const event = spec.event as unknown as EventSource<unknown>;
    const source: EventSource<unknown> = {
      __kind: "event",
      def: event.def,
      filter: spec.where,
    };
    // `jobs.resume` is registered as a builtin in
    // `@plugins/infra/plugins/jobs/server`. Bind by name so this module
    // doesn't import the factory back from jobs (which would still be
    // safe, but keeps the events→jobs edge minimal).
    await UNSAFE_triggerByName({
      on: source,
      jobName: "jobs.resume",
      with: spec.with,
      oneShot: spec.oneShot,
    });
  },
});
