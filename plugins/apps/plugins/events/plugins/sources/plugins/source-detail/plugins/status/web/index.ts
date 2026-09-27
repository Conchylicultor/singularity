import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { EventSourceDetail } from "@plugins/apps/plugins/events/plugins/sources/web";
import {
  SourceStatusSection,
  SourceStatusSummary,
  useSourceStatusDefaultOpen,
} from "./components/status-section";
import { symbol } from "@plugins/ui/plugins/icons/core";

export default {
  description:
    "Status section of the Events source side-pane: the source's current state (also shown as a collapsed-card chip), its run watermarks and probe fingerprint, and the classified terminal error verbatim when it is parked.",
  contributions: [
    EventSourceDetail.Section({
      id: "status",
      label: "Status",
      icon: symbol("info"),
      component: SourceStatusSection,
      summary: SourceStatusSummary,
      useDefaultOpen: useSourceStatusDefaultOpen,
    }),
  ],
} satisfies PluginDefinition;
