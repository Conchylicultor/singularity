import type { ServerContribution } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import type { VariantRegionCore } from "../core";

/**
 * The server-side half of a variant region: registers the config descriptor so
 * the per-app fork/scope machinery and `useConfig` resolution work. A region
 * that contributes the web half but not this throws loudly at boot (R4).
 */
export function variantRegionServerContribution<Props>(
  core: VariantRegionCore<Props>,
): ServerContribution {
  return ConfigV2.Register({ descriptor: core.config });
}
