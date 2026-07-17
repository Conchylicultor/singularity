import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { MdTimeline, MdHistory } from "react-icons/md";
import {
  bootProfilePane,
  bootProfileDetailPane,
  bootProfileListPane,
} from "./panes";

// Pure presentational Gantt of a BootTrace (no store/performance.* reads), so a
// beacon-carried snapshot renders identically elsewhere (the trace detail's
// client-boot lane embeds it).
export { BootProfileGantt } from "./components/boot-profile-gantt";

export default {
  description:
    "Browser boot profiler Gantt debug page: the request → first-paint timeline plus per-resource wait/work split, with shareable permalinks and a browsable list of saved snapshots.",
  contributions: [
    Pane.Register({ pane: bootProfilePane }),
    Pane.Register({ pane: bootProfileDetailPane }),
    Pane.Register({ pane: bootProfileListPane }),
    DebugApp.Sidebar({
      id: "boot-profile",
      ...sidebarNavItem({
        title: "Boot Profile",
        icon: MdTimeline,
        onClick: () => openPane(bootProfilePane, {}, { mode: "root" }),
      }),
    }),
    DebugApp.Sidebar({
      id: "boot-profiles-list",
      ...sidebarNavItem({
        title: "Boot Profiles",
        icon: MdHistory,
        onClick: () => openPane(bootProfileListPane, {}, { mode: "root" }),
      }),
    }),
  ],
} satisfies PluginDefinition;
