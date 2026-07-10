import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { writeBootEvent } from "./internal/write-boot-event";

export { readBootEvents } from "./internal/read-boot-events";
export { BootEventSchema } from "./internal/schema";
export type { BootEvent } from "./internal/schema";

export default {
  description:
    "Durable per-boot event line: the onReady hook appends one boot.jsonl log-channel line per backend boot (the wall-clock interval [processStartedAt, readyAt]), and readBootEvents(worktree, windowMs) reads them back — so deploy-restart bursts render as interval bars on cross-worktree timelines, with no DB table (survives re-forks, readable while a backend is wedged).",
  onReady: () => {
    writeBootEvent();
  },
} satisfies ServerPluginDefinition;
