import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdTune } from "react-icons/md";
import { EventSourceDetail } from "@plugins/apps/plugins/events/plugins/sources/web";
import { SourceSettingsSection } from "./components/settings-section";

export default {
  description:
    "Settings section of the Events source side-pane: the source's own name plus the type's configFields, rendered generically through the fields FieldRenderer as one form with per-field autosave. Names no source type.",
  contributions: [
    EventSourceDetail.Section({
      id: "settings",
      label: "Settings",
      icon: MdTune,
      component: SourceSettingsSection,
      // No `useAvailable`: the card always has at least the source's name, so
      // there is no longer a state in which it opens onto emptiness.
      useDefaultOpen: () => true,
    }),
  ],
} satisfies PluginDefinition;
