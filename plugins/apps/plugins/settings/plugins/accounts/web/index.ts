import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdKey } from "react-icons/md";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { accountsPane } from "@plugins/auth/web";
import { Settings } from "@plugins/apps/plugins/settings/plugins/shell/web";

export default {
  description:
    "Account settings surface: registers the accounts pane and its Settings sidebar entry.",
  contributions: [
    Pane.Register({ pane: accountsPane }),
    Settings.Sidebar({
      id: "accounts",
      ...sidebarNavItem({
        title: "Account",
        icon: MdKey,
        onClick: () => openPane(accountsPane, {}, { mode: "root" }),
      }),
    }),
  ],
} satisfies PluginDefinition;
