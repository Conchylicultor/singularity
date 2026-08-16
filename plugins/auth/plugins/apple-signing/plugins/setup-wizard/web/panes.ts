import { Pane } from "@plugins/primitives/plugins/pane/web";
import { accountsPane } from "@plugins/auth/web";
import { settingsApp } from "@plugins/apps/plugins/settings/plugins/shell/core";
import { AppleSetupPane } from "./components/apple-setup-pane";

export const appleSetupPane = Pane.define({
  id: "apple-setup",
  app: settingsApp,
  defaultAncestors: [accountsPane],
  segment: "apple/setup",
  component: AppleSetupPane,
  chrome: { title: "Set up Apple Signing", history: false, close: true },
});
