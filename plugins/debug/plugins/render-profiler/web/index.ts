import { Core, type PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdInsights } from "react-icons/md";
import { ProfilerInstaller } from "./internal/global-api";
import { renderProfilerPane } from "./panes";

export { renderProfilerPane } from "./panes";

export default {
  description:
    "On-demand React fiber-commit profiler: when started, attributes each commit to its initiating component and the offending hook (incl. useSyncExternalStore), surfaced as the Debug → Render Profiler pane and the window.__reactRenderProfiler API.",
  contributions: [
    Pane.Register({ pane: renderProfilerPane }),
    DebugApp.Sidebar({
      id: "render-profiler",
      ...sidebarNavItem({
        title: "Render Profiler",
        icon: MdInsights,
        onClick: () => openPane(renderProfilerPane, {}, { mode: "root" }),
      }),
    }),
    Core.Root({ component: ProfilerInstaller }),
  ],
} satisfies PluginDefinition;
