import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdTune } from "react-icons/md";
import { EventSourceDetail } from "@plugins/apps/plugins/events/plugins/sources/web";
import {
  SourceSettingsSection,
  useSourceSettingsAvailable,
} from "./components/settings-section";

export default {
  description:
    "Settings section of the Events source side-pane: the source type's own configFields rendered generically through the fields FieldRenderer, with per-field autosave and the type's optional bespoke chrome. Names no source type.",
  contributions: [
    EventSourceDetail.Section({
      id: "settings",
      label: "Settings",
      icon: MdTune,
      component: SourceSettingsSection,
      useAvailable: useSourceSettingsAvailable,
      useDefaultOpen: () => true,
    }),
  ],
} satisfies PluginDefinition;
