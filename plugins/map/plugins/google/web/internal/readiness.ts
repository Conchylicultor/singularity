import type { MapRendererReadiness } from "@plugins/map/web";
import { useMapsAccess } from "@plugins/integrations/plugins/google-maps/web";

/** The live map's readiness, in the host's three states: loading is never "not set up". */
export function useGoogleMapReadiness(): MapRendererReadiness {
  const access = useMapsAccess("map");
  if (access.loading) return "pending";
  // A failed read is "blocked": the access action renders it with Retry.
  if (access.error !== null) return "blocked";
  return access.ready ? "ready" : "blocked";
}
