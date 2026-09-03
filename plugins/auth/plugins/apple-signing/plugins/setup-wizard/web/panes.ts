import { Pane } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { accountsRoute } from "@plugins/auth/web";
import { settingsApp } from "@plugins/apps/plugins/settings/plugins/shell/core";
import { AppleSetupPane } from "./components/apple-setup-pane";

const appleSetupRoute = defineRoute({
  id: "apple-setup",
  segment: "apple/setup",
  parent: accountsRoute,
});

export const appleSetupPane = Pane.define({
  route: appleSetupRoute,
  app: settingsApp,
  component: AppleSetupPane,
  chrome: { title: "Set up Apple Signing", history: false, close: true },
});
