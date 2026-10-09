import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { IdKinds } from "@plugins/ids/server";
import { browserVisitIdKind } from "../core";
import { browserRecentsServed } from "./internal/resource";
import { handlePostBrowserHistory } from "./internal/routes";
import { postBrowserHistory } from "../shared/endpoints";

export { browserHistory } from "./internal/tables";
export { recordVisit } from "./internal/mutations";

export default {
  description:
    "Browser history store (browser_history table), the distinct-by-url recents live value, and the POST /api/browser/history record endpoint.",
  contributions: [
    IdKinds.Kind({ kind: browserVisitIdKind }),
    ...browserRecentsServed.declare,
  ],
  httpRoutes: {
    [postBrowserHistory.route]: handlePostBrowserHistory,
  },
} satisfies ServerPluginDefinition;
