import {
  Resource,
  type ServerPluginDefinition,
} from "@plugins/framework/plugins/server-core/core";
import { queryThreadsEndpoint } from "../core";
import { handleQueryThreads } from "./internal/handler";
import { mailThreadsRevisionServerResource } from "./internal/resource";

export { mailThreadsRevisionServerResource } from "./internal/resource";

export default {
  description:
    "Thread-list server: the windowed keyset thread-query endpoint (POST /api/mail/threads) for a mailbox view and the coarse `mail_threads` revision tick that keeps the loaded pages live.",
  contributions: [Resource.Declare(mailThreadsRevisionServerResource)],
  httpRoutes: {
    [queryThreadsEndpoint.route]: handleQueryThreads,
  },
} satisfies ServerPluginDefinition;
