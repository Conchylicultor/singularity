import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SidebarFraming } from "@plugins/ui/plugins/sidebar-framing/web";
import { FlushFraming } from "./components/flush-framing";

export default {
  description:
    "Flush sidebar framing — the default, pixel-identical to the original app shell.",
  contributions: [
    SidebarFraming.Variant({
      id: "flush",
      label: "Flush",
      match: "flush",
      component: FlushFraming,
    }),
  ],
} satisfies PluginDefinition;
