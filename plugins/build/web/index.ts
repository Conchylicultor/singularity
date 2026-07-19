import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdBuild } from "react-icons/md";
import { ConfigV2 } from "@plugins/config_v2/web";
import { buildConfig } from "../shared/config";
import { BuildButton } from "./components/build-button";
import { buildPane, buildDetailPane } from "./panes";

export { BuildDetail as BuildDetailSlots } from "./slots";
export { buildPane, buildDetailPane } from "./panes";
export { useStaleFrontend } from "./hooks/use-stale-frontend";

export default {
  collapsed: true,
  description: "Trigger `./singularity build` from the toolbar.",
  contributions: [
    ActionBar.Item({
      id: "build",
      component: BuildButton,
    }),
    Pane.Register({ pane: buildPane }),
    Pane.Register({ pane: buildDetailPane }),
    // Build panes live in the Debug app (`/debug/build`), alongside the other
    // developer-facing observability surfaces (Reports, Logs, Profiling). The
    // action-bar button links there via `buildRoute.link(debugApp, …)`; this is
    // the in-app entry point for the same panes.
    DebugApp.Sidebar({
      id: "build",
      ...sidebarNavItem({
        title: "Builds",
        icon: MdBuild,
        onClick: () => openPane(buildPane, {}, { mode: "root" }),
      }),
    }),
    ConfigV2.WebRegister({ descriptor: buildConfig }),
  ],
} satisfies PluginDefinition;
