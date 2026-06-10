import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SidebarFraming } from "@plugins/ui/plugins/sidebar-framing/web";
import { InsetFraming } from "./components/inset-framing";

export default {
  description:
    "Inset sidebar framing — the main area floats as a rounded inset card.",
  contributions: [
    SidebarFraming.Variant({
      id: "inset",
      label: "Inset",
      match: "inset",
      component: InsetFraming,
    }),
  ],
} satisfies PluginDefinition;
