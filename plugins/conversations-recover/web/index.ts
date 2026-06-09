import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdRestore } from "react-icons/md";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { DebugApp } from "@plugins/apps/plugins/debug/plugins/shell/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { recoveryPane } from "./pane";

export { recoveryPane } from "./pane";

export default {
  description:
    "Sidebar entry + pane listing recently-closed conversations with restore buttons.",
  contributions: [
    Pane.Register({ pane: recoveryPane }),
    DebugApp.Sidebar({
      id: "conversations-recover",
      ...sidebarNavItem({ title: "Recovery", icon: MdRestore, onClick: () => openPane(recoveryPane, {}, { mode: "root" }) }),
    }),
  ],
} satisfies PluginDefinition;
