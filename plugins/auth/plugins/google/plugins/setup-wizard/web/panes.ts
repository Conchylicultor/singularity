import { Pane, defineRoute } from "@plugins/primitives/plugins/pane/web";
import { accountsRoute } from "@plugins/auth/web";
import { settingsApp } from "@plugins/apps/plugins/settings/plugins/shell/core";
import { GoogleSetupPane } from "./components/google-setup-pane";

export const googleSetupPane = Pane.define({
  route: defineRoute({
    id: "google-setup",
    segment: "google/setup",
    parent: accountsRoute,
  }),
  app: settingsApp,
  component: GoogleSetupPane,
  chrome: { title: "Connect Google", history: false, close: true },
});
