import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { refreshSourceJob, refreshTickJob } from "./internal/jobs";
import { refreshRunnerRegistration } from "./internal/request-refresh";
import {
  eventSourceRunsRetention,
  eventsRetention,
} from "./internal/retention";

export { runSource } from "./internal/run-source";
export { requestRefresh } from "./internal/request-refresh";

export default {
  description:
    "Events refresh engine: the main-only cadence tick and the per-source refresh job, the probe/extract runSource pipeline (fingerprint cache → upsert diff → soft disappearance), the run ledger, terminal/transient error classification onto the source row, and the retention sweeps for events + runs.",
  register: [
    refreshSourceJob,
    refreshTickJob,
    refreshRunnerRegistration,
    eventsRetention,
    eventSourceRunsRetention,
  ],
} satisfies ServerPluginDefinition;
