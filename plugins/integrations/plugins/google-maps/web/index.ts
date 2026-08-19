import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  useMapsAccess,
  type MapsAccess,
  type MapsAccessBlocker,
} from "./internal/use-maps-access";
export {
  MapsAccessAction,
  MAPS_BLOCKER_BODY,
} from "./components/maps-access-action";

export default {
  description:
    "Google Maps Platform access broker (web): reactive readiness state plus the 'set up Google Maps' affordance consumers render in place of routing the user to Settings.",
  contributions: [],
} satisfies PluginDefinition;
