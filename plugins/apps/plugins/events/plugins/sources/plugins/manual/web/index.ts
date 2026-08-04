import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdEditCalendar } from "react-icons/md";
import { EventSources } from "@plugins/apps/plugins/events/plugins/events-core/web";
import { MANUAL_SOURCE_TYPE_ID, manualSourceConfigFields } from "../core";

// No form code, and in this type's case no fields either: the `+` menu builds
// the add/configure surface from `configFields` alone, which for a manual source
// is empty. That is the point of the workstream — a source type that fetches
// nothing and configures nothing still appears in the menu with working chrome.

export default {
  description:
    "Manual event source type: contributes the hand-entry option to the Events `+` source menu. Zero-config — the user is the extractor, so there is nothing to point it at.",
  contributions: [
    EventSources.Type({
      id: MANUAL_SOURCE_TYPE_ID,
      label: "Manual",
      icon: MdEditCalendar,
      configFields: manualSourceConfigFields,
    }),
  ],
} satisfies PluginDefinition;
