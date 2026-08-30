import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { releaseRunKind } from "./internal/arm";

export default {
  description:
    "The release arm of the merged run space: binds `release_runs` into the runs union, mapping its own three-way status onto the shared outcome axis through a typed-total record, and contributing the composition / target / platform / provenance columns only a release row has — `release.kind` namespaced so the ledger's own kind column cannot shadow the run-kind discriminator.",
  register: [releaseRunKind],
} satisfies ServerPluginDefinition;
