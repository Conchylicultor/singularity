import { Core, type PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdBolt } from "react-icons/md";
import { EmitInstaller } from "./internal/global-api";
import { liveStateEmitPane } from "./panes";

export { liveStateEmitPane } from "./panes";

export default {
  description:
    "Synthetic no-op live-state push emitter: drives N pushes/sec for a chosen resource so churn-driven render/DOM bugs reproduce deterministically, surfaced as the Debug → Live-State Emit pane and the window.__liveStateEmit API.",
  contributions: [
    Pane.Register({ pane: liveStateEmitPane }),
    DebugApp.Sidebar({
      id: "live-state-emit",
      ...sidebarNavItem({
        title: "Live-State Emit",
        icon: MdBolt,
        onClick: () => openPane(liveStateEmitPane, {}, { mode: "root" }),
      }),
    }),
    Core.Root({ component: EmitInstaller }),
  ],
} satisfies PluginDefinition;
