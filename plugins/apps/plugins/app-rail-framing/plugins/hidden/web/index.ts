import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { AppRailFraming } from "@plugins/apps/plugins/app-rail-framing/web";
import { HiddenFraming } from "./components/hidden-framing";

export default {
  description: "Hidden app rail — no switcher; sidebar slides flush to the edge.",
  contributions: [
    AppRailFraming.Variant({
      id: "hidden",
      label: "Hidden",
      match: "hidden",
      component: HiddenFraming,
    }),
  ],
} satisfies PluginDefinition;
