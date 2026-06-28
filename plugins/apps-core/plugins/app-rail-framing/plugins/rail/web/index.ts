import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { AppRailFraming } from "@plugins/apps-core/plugins/app-rail-framing/web";
import { RailFraming } from "./components/rail-framing";

export default {
  description: "App-rail framing — the default 2.5rem icon rail.",
  contributions: [
    AppRailFraming.Variant({
      id: "rail",
      label: "Rail",
      match: "rail",
      component: RailFraming,
    }),
  ],
} satisfies PluginDefinition;
