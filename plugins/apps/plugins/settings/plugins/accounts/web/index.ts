import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { accountsPane } from "@plugins/auth/web";
import { Settings } from "@plugins/apps/plugins/settings/plugins/shell/web";
import { symbol } from "@plugins/ui/plugins/icons/core";

export default {
  description:
    "Account settings surface: registers the accounts pane and its Settings sidebar entry.",
  contributions: [
    Pane.Register({ pane: accountsPane }),
    Settings.Sidebar({
      id: "accounts",
      title: "Account",
      icon: symbol("key"),
      onClick: () => openPane(accountsPane, {}, { mode: "root" }),
    }),
  ],
} satisfies PluginDefinition;
