import { Pane } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { accountsRoute } from "@plugins/auth/web";
import { settingsApp } from "@plugins/apps/plugins/settings/plugins/shell/core";
import { GoogleMapsSetupPane } from "./components/google-maps-setup-pane";

const googleMapsSetupRoute = defineRoute({
  id: "google-maps-setup",
  segment: "google-maps/setup",
  parent: accountsRoute,
});

export const googleMapsSetupPane = Pane.define({
  route: googleMapsSetupRoute,
  app: settingsApp,
  component: GoogleMapsSetupPane,
  chrome: { title: "Set up Google Maps", history: false, close: true },
});
