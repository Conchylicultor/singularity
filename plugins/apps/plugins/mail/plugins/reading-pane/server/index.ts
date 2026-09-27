import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { threadMessagesServed } from "./internal/resource";

export default {
  description:
    "Reading pane server: serves the thread-messages live collection (threadMessages) over mail_messages, so a reply/flag/hydration in an open thread pushes automatically.",
  contributions: [...threadMessagesServed.declare],
} satisfies ServerPluginDefinition;
