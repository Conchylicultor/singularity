import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import {
  bootProfilePane,
  bootProfileDetailPane,
  bootProfileListPane,
} from "./panes";
import { symbol } from "@plugins/ui/plugins/icons/core";

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
      title: "Boot Profile",
      icon: symbol("timeline"),
      opens: { pane: bootProfilePane, params: {} },
    }),
    DebugApp.Sidebar({
      id: "boot-profiles-list",
      title: "Boot Profiles",
      icon: symbol("history"),
      opens: { pane: bootProfileListPane, params: {} },
    }),
  ],
  slots: {
    "debug-boot-profile": bootProfilePane,
    "debug-boot-profile-detail": bootProfileDetailPane,
    "debug-boot-profiles-list": bootProfileListPane,
  },
} satisfies PluginDefinition;
