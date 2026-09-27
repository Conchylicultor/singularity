import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { EventSourceRunDetail } from "@plugins/apps/plugins/events/plugins/sources/plugins/source-detail/plugins/runs/web";
import {
  ModelCallSection,
  useModelCallAvailable,
} from "./components/model-call-section";
import { symbol } from "@plugins/ui/plugins/icons/core";

export default {
  description:
    "Model call section of the Events run pane: the prompt and output behind one run, reached through claude-cli's generic correlation API. Renders all three arms — the calls, 'never called' (the right answer for a cheap unchanged run), and 'the log no longer retains it'.",
  contributions: [
    EventSourceRunDetail.Section({
      id: "model-call",
      label: "Model call",
      icon: symbol("auto-awesome"),
      component: ModelCallSection,
      // Loading is not emptiness: the card must exist while the fetch is in
      // flight, or it would pop in after the run resolves.
      useAvailable: useModelCallAvailable,
    }),
  ],
} satisfies PluginDefinition;
