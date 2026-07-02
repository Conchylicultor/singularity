import {
  Resource,
  type ServerPluginDefinition,
} from "@plugins/framework/plugins/server-core/core";
import {
  mailLabelsServerResource,
  mailViewCountsServerResource,
} from "./internal/resources";

export {
  mailLabelsServerResource,
  mailViewCountsServerResource,
} from "./internal/resources";

export default {
  description:
    "Mailbox view model server: the user-labels live resource and the per-view unread-count live resource (system views + labels), both scoped to the mail tables and pushed via the DB change-feed.",
  contributions: [
    Resource.Declare(mailLabelsServerResource),
    Resource.Declare(mailViewCountsServerResource),
  ],
} satisfies ServerPluginDefinition;
