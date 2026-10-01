import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { mailThreadsServed } from "./internal/collection";

export default {
  description:
    "Threads DataView server: serves the `mail.threads` live collection over mail_threads — the active tab's whole filter (mailbox scope included) and the pane's account scope compile into each window tuple, and the routed change feed refills exactly the threads a write touches.",
  contributions: [...mailThreadsServed.declare],
} satisfies ServerPluginDefinition;
