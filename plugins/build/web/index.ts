import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { ConfigV2 } from "@plugins/config_v2/web";
import { buildConfig } from "../shared/config";
import { BuildButton } from "./components/build-button";
import { ReloadChip } from "./components/reload-chip";
import { useBuildActivity } from "./hooks/use-build-activity";
import { buildPane, buildDetailPane } from "./panes";
import { BuildDetail } from "./slots";
import { symbol } from "@plugins/ui/plugins/icons/core";

export { BuildDetail as BuildDetailSlots } from "./slots";
export { buildPane, buildDetailPane } from "./panes";
export { useStaleFrontend } from "./hooks/use-stale-frontend";
export { useReloadAdvice } from "./hooks/use-reload-advice";
export type { ReloadAdvice } from "./hooks/use-reload-advice";

export default {
  collapsed: true,
  description: "Trigger `./singularity build` from the toolbar.",
  contributions: [
    ActionBar.Item({
      id: "build",
      component: BuildButton,
    }),
    // The collapsed floating bar hides the Build button; these keep a running /
    // failed build (a ring around the health dot) and a due reload (a chip
    // beside it) visible anyway.
    ActionBar.Activity({ id: "build", useActivity: useBuildActivity }),
    ActionBar.Glance({ id: "reload", component: ReloadChip }),
    Pane.Register({ pane: buildPane }),
    Pane.Register({ pane: buildDetailPane }),
    // Build panes live in the Debug app (`/debug/build`), alongside the other
    // developer-facing observability surfaces (Reports, Logs, Profiling). The
    // action-bar button links there via `buildRoute.link(debugApp, …)`; this is
    // the in-app entry point for the same panes.
    DebugApp.Sidebar({
      id: "build",
      title: "Builds",
      icon: symbol("build"),
      onClick: () => openPane(buildPane, {}, { mode: "root" }),
    }),
    ConfigV2.WebRegister({ descriptor: buildConfig }),
  ],
  slots: { ...BuildDetail, build: buildPane, "build-detail": buildDetailPane },
} satisfies PluginDefinition;
