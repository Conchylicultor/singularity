import { Pane } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { accountsRoute } from "@plugins/auth/web";
import { settingsApp } from "@plugins/apps/plugins/settings/plugins/shell/core";
import { GoogleSetupPane } from "./components/google-setup-pane";

const googleSetupRoute = defineRoute({
  id: "google-setup",
  segment: "google/setup",
  parent: accountsRoute,
});

export const googleSetupPane = Pane.define({
  route: googleSetupRoute,
  app: settingsApp,
  component: GoogleSetupPane,
  chrome: { title: "Connect Google", history: false, close: true },
});
