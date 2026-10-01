import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { eventsListServed } from "./internal/collection";

export default {
  description:
    "Events DataView server: the `events.list` live collection over the events table joined to its source (a required lookup, routed in reverse: a source write refills that source's events, gated on the columns the list reads), with soft-deleted events and a disabled source's events hidden by default.",
  contributions: [...eventsListServed.declare],
} satisfies ServerPluginDefinition;
