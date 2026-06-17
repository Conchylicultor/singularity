import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { browserRecentsServerResource } from "./internal/resource";
import { handlePostBrowserHistory } from "./internal/routes";
import { postBrowserHistory } from "../shared/endpoints";

export { browserHistory } from "./internal/tables";
export { recordVisit } from "./internal/mutations";
export { browserRecentsServerResource } from "./internal/resource";

export default {
  description:
    "Browser history store (browser_history table), the distinct-by-url recents live resource, and the POST /api/browser/history record endpoint.",
  contributions: [Resource.Declare(browserRecentsServerResource)],
  httpRoutes: {
    [postBrowserHistory.route]: handlePostBrowserHistory,
  },
} satisfies ServerPluginDefinition;
