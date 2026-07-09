import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { defineRetention } from "./internal/define-retention";
export type { RetentionSpec, RetentionJob } from "./internal/define-retention";
export { markCascadeBounded } from "./internal/assert-cascade";
export { getGrowthBounds } from "./internal/growth-bounds";
export type { GrowthBound } from "./internal/growth-bounds";

export default {
  description:
    "Retention primitive: defineRetention wraps defineJob into a nightly TTL sweep (DELETE WHERE column < now()-ttl) whose growth bound is recorded only when the sweep is mounted; markCascadeBounded verifies at module eval that an FK onDelete cascade really reclaims the rows. getGrowthBounds exposes the resulting true set of growth bounds.",
} satisfies ServerPluginDefinition;
