import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdEventNote } from "react-icons/md";
import { EventSourceRunDetail } from "@plugins/apps/plugins/events/plugins/sources/plugins/source-detail/plugins/runs/web";
import {
  ExtractedEventsSection,
  useExtractedEventsAvailable,
} from "./components/extracted-events-section";

export default {
  description:
    "Extracted events section of the Events run pane: which events the run actually touched and what it did to each — the detail behind the summary's counts, as a DataView whose `Change` (new / updated / gone) is a full filter and group-by dimension.",
  contributions: [
    EventSourceRunDetail.Section({
      id: "extracted-events",
      label: "Extracted events",
      icon: MdEventNote,
      component: ExtractedEventsSection,
      // Loading is not emptiness: the card must exist while the fetch is in
      // flight, or it would pop in after the run resolves.
      useAvailable: useExtractedEventsAvailable,
      // Open by default, unlike its peers: the summary directly above states
      // "4 found · 4 new", and this is the list those numbers count. Model call
      // and caveats answer follow-up questions and stay folded.
      useDefaultOpen: () => true,
    }),
  ],
} satisfies PluginDefinition;
