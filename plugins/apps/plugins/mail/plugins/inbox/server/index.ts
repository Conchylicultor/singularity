import {
  Resource,
  type ServerPluginDefinition,
} from "@plugins/framework/plugins/server-core/core";
// Force the fields filter-sql capability barrels to evaluate (self-registering
// their operator maps into the `server-capabilities` eager index) so
// `resolveFieldFilterSql` in handle-query resolves, and so the composition
// closure includes those barrels in any release bundle shipping inbox.
import "@plugins/fields/plugins/server-capabilities-loader/server";
import { queryInbox } from "../core";
import { handleQuery } from "./internal/handle-query";
import { inboxRevisionServerResource } from "./internal/revision-resource";

export { handleQuery } from "./internal/handle-query";
export { inboxRevisionServerResource } from "./internal/revision-resource";

export default {
  description:
    "Inbox DataView server: the keyset INBOX-scoped thread query (POST /api/mail/inbox/query) over mail_threads + the scalar revision-tick live resource that keeps the inbox DataView window fresh.",
  contributions: [Resource.Declare(inboxRevisionServerResource)],
  httpRoutes: {
    [queryInbox.route]: handleQuery,
  },
} satisfies ServerPluginDefinition;
