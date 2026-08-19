import { Pane } from "@plugins/primitives/plugins/pane/web";
import { accountsPane } from "@plugins/auth/web";
import { settingsApp } from "@plugins/apps/plugins/settings/plugins/shell/core";
import { GoogleMapsSetupPane } from "./components/google-maps-setup-pane";

export const googleMapsSetupPane = Pane.define({
  id: "google-maps-setup",
  app: settingsApp,
  defaultAncestors: [accountsPane],
  segment: "google-maps/setup",
  component: GoogleMapsSetupPane,
  chrome: { title: "Set up Google Maps", history: false, close: true },
});
