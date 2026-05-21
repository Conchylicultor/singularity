import { Pane } from "@plugins/primitives/plugins/pane/web";
import { AccountsPane } from "./components/accounts-pane";

export const accountsPane = Pane.define({
  id: "accounts",
  segment: "accounts",
  component: AccountsPane,
  chrome: { title: "Accounts", history: true },
});
