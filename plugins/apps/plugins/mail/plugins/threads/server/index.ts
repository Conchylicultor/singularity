import {
  Resource,
  type ServerPluginDefinition,
} from "@plugins/framework/plugins/server-core/core";
import { queryThreads } from "../core";
import { handleQuery } from "./internal/handle-query";
import { mailThreadsRevisionServerResource } from "./internal/revision-resource";

export { handleQuery } from "./internal/handle-query";
export { mailThreadsRevisionServerResource } from "./internal/revision-resource";
export { buildThreadsWhere } from "./internal/where";

export default {
  description:
    "Threads DataView server: the keyset thread query (POST /api/mail/threads/query) over mail_threads — the active tab's whole FilterGroup (mailbox scope included) compiles through the standard compileWhere path — plus the scalar revision-tick live resource that keeps the loaded window fresh.",
  contributions: [Resource.Declare(mailThreadsRevisionServerResource)],
  httpRoutes: {
    [queryThreads.route]: handleQuery,
  },
} satisfies ServerPluginDefinition;
