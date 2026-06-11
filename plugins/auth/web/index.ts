import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

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
  collapsed: true,
  description:
    "Shared authentication infrastructure (OAuth 2.0, API keys). Exposes the accounts pane + Auth.Provider slot; the Settings app surfaces the Account entry.",
  loadBearing: true,
  contributions: [],
} satisfies PluginDefinition;
