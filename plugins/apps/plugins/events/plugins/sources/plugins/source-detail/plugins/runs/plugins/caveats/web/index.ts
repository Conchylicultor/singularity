import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { EventSourceRunDetail } from "@plugins/apps/plugins/events/plugins/sources/plugins/source-detail/plugins/runs/web";
import {
  CaveatsSection,
  useCaveatsAvailable,
} from "./components/caveats-section";
import { symbol } from "@plugins/ui/plugins/icons/core";

export default {
  description:
    "Extraction caveats section of the Events run pane: what the page's schedule said that the event date format could not express, as the extraction itself reported it. Renders the three arms — the caveats, the fetch failure, and 'reported none', which is the healthy answer and is worded as one.",
  contributions: [
    EventSourceRunDetail.Section({
      id: "caveats",
      label: "Extraction caveats",
      icon: symbol("warning"),
      component: CaveatsSection,
      // Loading is not emptiness: the card must exist while the fetch is in
      // flight, or it would pop in after the run resolves.
      useAvailable: useCaveatsAvailable,
    }),
  ],
} satisfies PluginDefinition;
