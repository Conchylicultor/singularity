import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SurfaceArrangement } from "@plugins/apps/plugins/surface-arrangement/web";
import { AppWindowsBody } from "./components/app-windows-body";

export default {
  description:
    "Desktop surface arrangement — the open tabs laid out as free-floating, draggable, resizable windows (drag, resize, z-order on focus, maximize, minimize).",
  contributions: [
    SurfaceArrangement.Variant({
      id: "desktop",
      label: "Desktop",
      match: "desktop",
      component: AppWindowsBody,
    }),
  ],
} satisfies PluginDefinition;
