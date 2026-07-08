import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { defineRetention, markFirehose } from "./internal/define-retention";
export type { RetentionSpec, RetentionJob } from "./internal/define-retention";

export default {
  description:
    "Retention primitive: defineRetention wraps defineJob into a nightly TTL sweep (DELETE WHERE column < now()-ttl), and markFirehose declares unbounded-growth tables. The retention:firehose-bounded check fails when a declared firehose table has neither a retention policy nor a cascade owner.",
} satisfies ServerPluginDefinition;
