import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { startReportOutbox, stopReportOutbox } from "./internal/watcher";

export default {
  description:
    "Report outbox drain: on main only, records every report a process with no server (a CLI run, a supervised child) wrote into the host-global outbox — once at boot, then on each file change (no polling). An entry whose code main has changed since the writer's branch point (git diff of its paths) is dropped and logged; an entry that cannot be filed (bad JSON, unknown kind, rejected payload, undecidable staleness) becomes a server-caught crash report and is deleted.",
  onReady: async () => {
    await startReportOutbox();
  },
  onShutdown: async () => {
    await stopReportOutbox();
  },
} satisfies ServerPluginDefinition;
