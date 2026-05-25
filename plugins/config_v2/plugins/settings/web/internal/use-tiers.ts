import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { configV2TiersResource } from "@plugins/config_v2/core";
import type { ConfigV2Tiers } from "@plugins/config_v2/core";

export function useTiers(storePath: string): ConfigV2Tiers {
  const result = useResource(configV2TiersResource, { path: storePath });
  if (result.pending) return {};
  return result.data;
}
