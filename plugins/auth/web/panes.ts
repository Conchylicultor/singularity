import { Pane } from "@plugins/primitives/plugins/pane/web";
import { settingsApp } from "@plugins/apps/plugins/settings/plugins/shell/core";
import { AccountsPane } from "./components/accounts-pane";

export const accountsPane = Pane.define({
  id: "accounts",
  app: settingsApp,
  segment: "accounts",
  component: AccountsPane,
  chrome: { title: "Accounts", history: true },
});
