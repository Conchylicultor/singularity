import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { eventSourcesPane } from "@plugins/apps/plugins/events/plugins/sources/web";
import { RefreshAllAction } from "./components/refresh-all-action";

export default {
  description:
    "Refresh-all action in the Events sources pane toolbar: one request that enqueues a run for every ENABLED source, with the enqueued / already-running / skipped tally rendered arm by arm as a toast. Contributed into the pane's Actions, so the sources pane knows nothing about it.",
  contributions: [
    eventSourcesPane.Actions({
      id: "refresh-all",
      component: RefreshAllAction,
    }),
  ],
} satisfies PluginDefinition;
