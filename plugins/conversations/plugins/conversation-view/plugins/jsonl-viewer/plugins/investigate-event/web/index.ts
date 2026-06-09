import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { InvestigateEventButton } from "./components/investigate-event-button";

export default {
  name: "JSONL Viewer: Investigate event button",
  description:
    "Presentational hover-revealed button on JSONL fallback rows that launches an investigation agent seeded with the raw event JSON and source conversation id.",
  contributions: [],
} satisfies PluginDefinition;
