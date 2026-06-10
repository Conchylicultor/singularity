import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SidebarFraming } from "@plugins/ui/plugins/sidebar-framing/web";
import { FloatingFraming } from "./components/floating-framing";

export default {
  description:
    "Floating sidebar framing — the sidebar renders as a rounded, detached card.",
  contributions: [
    SidebarFraming.Variant({
      id: "floating",
      label: "Floating",
      match: "floating",
      component: FloatingFraming,
    }),
  ],
} satisfies PluginDefinition;
