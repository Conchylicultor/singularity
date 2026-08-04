import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { EventList } from "@plugins/apps/plugins/events/plugins/event-list/web";
import { SourceField } from "./components/source-field";

export default {
  description:
    "Contributes the `source` dimension into the events DataView: a `sourceId` enum field whose options are the live configured sources, so events can be filtered, sorted and grouped by source with no edit to event-list.",
  contributions: [EventList.Fields({ id: "source", component: SourceField })],
} satisfies PluginDefinition;
