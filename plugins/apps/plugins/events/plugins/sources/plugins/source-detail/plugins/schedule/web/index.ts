import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdSchedule } from "react-icons/md";
import { EventSourceDetail } from "@plugins/apps/plugins/events/plugins/sources/web";
import { SourceScheduleSection } from "./components/schedule-section";

export default {
  description:
    "Schedule section of the Events source side-pane: the refresh cadence picker, the scheduling on/off switch, and Refresh now — whose discriminated RefreshSourceResult (enqueued / already-running / skipped) is rendered arm by arm rather than collapsed into 'done'.",
  contributions: [
    EventSourceDetail.Section({
      id: "schedule",
      label: "Schedule",
      icon: MdSchedule,
      component: SourceScheduleSection,
      useDefaultOpen: () => true,
    }),
  ],
} satisfies PluginDefinition;
