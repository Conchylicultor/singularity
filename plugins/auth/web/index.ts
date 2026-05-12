import type { PluginDefinition } from "@core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { sidebarNavItem } from "@plugins/primitives/plugins/app-shell/web";
import { Shell } from "@plugins/shell/web";
import { MdKey } from "react-icons/md";
import { accountsPane } from "./panes";

export { Auth } from "./slots";
export type {
  AuthProviderContribution,
  AuthProviderRowProps,
} from "./slots";
export { accountsPane } from "./panes";
export { useAuthState, useAccountStatus } from "./hooks";
export { ConnectButton } from "./components/connect-button";
export type { ConnectButtonProps } from "./components/connect-button";
export { startConnectFlow, disconnect, currentWorktreeName } from "./connect";
export type { ConnectArgs, ConnectResult } from "./connect";

export default {
  id: "auth",
  name: "Auth",
  description:
    "Shared authentication infrastructure (OAuth 2.0, API keys). Surfaces an Accounts sidebar entry; provider sub-plugins extend the Auth.Provider slot.",
  loadBearing: true,
  contributions: [
    Pane.Register({ pane: accountsPane }),
    Shell.Sidebar({
      id: "accounts",
      ...sidebarNavItem({ title: "Accounts", icon: MdKey, onClick: () => openPane(accountsPane, {}) }),
    }),
  ],
} satisfies PluginDefinition;
