import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Pane, openPane } from "@plugins/primitives/plugins/pane/web";
import { Auth } from "@plugins/auth/web";
import { SiGooglemaps } from "react-icons/si";
import { GOOGLE_MAPS_PROVIDER_ID } from "@plugins/auth/plugins/google-maps/core";
import { googleMapsSetupPane } from "./panes";

export { googleMapsSetupPane } from "./panes";

// The Accounts row lives here rather than on the parent plugin (which google's
// OAuth provider does) because the row's `configureCredentials` needs the pane
// and the pane needs `GOOGLE_MAPS_PROVIDER_ID`: parent → wizard → parent is a
// cross-plugin cycle the boundary check rejects. `auth/apple-signing` is the
// existing precedent for a wizard sub-plugin owning its provider's row.
export default {
  description:
    "Guided setup pane for the Google Maps Platform API key: project → Places API → billing → key → paste. Also contributes the Accounts provider row.",
  contributions: [
    Pane.Register({ pane: googleMapsSetupPane }),
    Auth.Provider({
      id: GOOGLE_MAPS_PROVIDER_ID,
      name: "Google Maps Platform",
      icon: SiGooglemaps,
      helpUrl: "https://console.cloud.google.com/apis/credentials",
      configureCredentials: () =>
        openPane(googleMapsSetupPane, {}, { mode: "root" }),
    }),
  ],
  slots: { "google-maps-setup": googleMapsSetupPane },
} satisfies PluginDefinition;
