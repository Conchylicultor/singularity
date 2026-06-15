import { z } from "zod";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { validatePin } from "./pinned";
import { queueRanksResource } from "./resource";

// Authoritative, status-driven pin revalidation. Bound to
// `conversation.statusChanged`, which fires at the tasks-core status-write
// chokepoint on every conversation transition (working↔waiting, →gone, →done,
// hard delete). Re-runs validatePin() — which advances the focus pin off any
// conversation that is no longer a valid pin target — and refreshes the queue
// ranks resource.
//
// This replaces the old `queueRanksResource → conversationsLiveResource`
// cascade edge as the catch-all that kept the pin honest under poller-driven
// status changes. In particular it closes the gap where a pinned conversation
// went `gone` inside a multi-conversation task (the parent task's derived
// status did not flip, so no other trigger fired) and the pin went stale.
//
// `dedup: "singleton"` collapses a burst of status flips (e.g. a poller tick
// advancing several conversations) into a single revalidation. validatePin
// reads live DB state, so coalescing is always safe.
export const pinRevalidateJob = defineJob({
  name: "queue.pin-revalidate",
  input: z.object({}).passthrough(),
  event: z.object({}).passthrough(),
  dedup: "singleton",
  maxAttempts: 2,
  run: async () => {
    await validatePin();
    queueRanksResource.notify();
  },
});
