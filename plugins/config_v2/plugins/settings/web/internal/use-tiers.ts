import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { ResourceResult } from "@plugins/primitives/plugins/live-state/web";
import { configV2TiersResource } from "@plugins/config_v2/core";
import type { ConfigV2Tiers } from "@plugins/config_v2/core";

// Raw gateable result — never collapse `pending` into `{}`. Callers gate.
export function useTiers(storePath: string): ResourceResult<ConfigV2Tiers> {
  return useResource(configV2TiersResource, { path: storePath });
}
