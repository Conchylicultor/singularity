import {
  Resource,
  type ServerPluginDefinition,
} from "@plugins/framework/plugins/server-core/core";
import { threadMessagesServerResource } from "./internal/resource";

export { threadMessagesServerResource } from "./internal/resource";

export default {
  description:
    "Reading pane server: the live per-thread message-envelope resource (threadMessagesResource), scoped to mail_messages so a reply/flag/hydration in the open thread pushes automatically.",
  contributions: [Resource.Declare(threadMessagesServerResource)],
} satisfies ServerPluginDefinition;
