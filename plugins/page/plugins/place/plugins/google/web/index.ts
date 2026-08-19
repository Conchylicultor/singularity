import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SiGooglemaps } from "react-icons/si";
import {
  MapsAccessAction,
  useMapsAccess,
} from "@plugins/integrations/plugins/google-maps/web";
import { Place } from "@plugins/page/plugins/place/web";
import { GOOGLE_PLACE_PROVIDER_ID } from "../shared";

export default {
  description:
    "Google Maps as a place-lookup source for the /place block: contributes the provider's name, icon, required attribution, and the 'set up Google Maps' affordance the block renders while no API key is configured.",
  contributions: [
    Place.Provider({
      id: GOOGLE_PLACE_PROVIDER_ID,
      label: "Google Maps",
      icon: SiGooglemaps,
      // Rendered in place of the search box while no key is configured. The
      // block never learns that the blocker is a key — it just renders whatever
      // the provider says will fix it.
      AccessAction: MapsAccessAction,
      useReady: () => useMapsAccess().ready,
      // Required by the Places policy whenever Places content is shown outside
      // a Google map — which is exactly this card, since v1 has no embedded map.
      attribution: "Powered by Google",
    }),
  ],
} satisfies PluginDefinition;
