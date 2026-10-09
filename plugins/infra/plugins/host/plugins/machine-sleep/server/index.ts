import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { machineSleepServed } from "./internal/publish";

export { publishSleepReading } from "./internal/publish";

export default {
  description:
    "Serves the machine.sleep live value (this box's sleep clock: boot, cumulative asleepMs, last wake) and publishSleepReading(), which re-reads the clock and pushes only when it changed — called by an existing periodic observer, so a wake reaches the browser without a poller of its own.",
  contributions: [...machineSleepServed.declare],
} satisfies ServerPluginDefinition;
