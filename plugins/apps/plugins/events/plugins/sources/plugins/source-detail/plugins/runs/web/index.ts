import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdHistory } from "react-icons/md";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { EventSourceDetail } from "@plugins/apps/plugins/events/plugins/sources/web";
import { SourceRunsSection } from "./components/runs-section";
import { OpenRunAction } from "./components/open-run-action";
import { eventSourceRunPane } from "./panes";
import { RunActions } from "./slots";

export { RunActions, EventSourceRunDetail } from "./slots";
export { eventSourceRunPane } from "./panes";

export default {
  description:
    "Runs section of the Events source side-pane: the run ledger as a DataView (outcome, event counts, duration, error), including the cheap `unchanged` runs — the record that makes 'why did nothing happen' answerable. A row drills into the run's own pane, whose regions are contributions.",
  contributions: [
    EventSourceDetail.Section({
      id: "runs",
      label: "Runs",
      icon: MdHistory,
      component: SourceRunsSection,
      // Open by default: the ledger is the answer to "did my source do
      // anything, and why not", which is the first question after adding one.
      useDefaultOpen: () => true,
    }),
    Pane.Register({ pane: eventSourceRunPane }),
    // This plugin's own action, in its own slot — the same shape `sources`
    // uses for `SourceDeleteAction`, so a contributor can add a run action
    // without this file being the place that lists them.
    RunActions({ id: "open", component: OpenRunAction }),
  ],
} satisfies PluginDefinition;
