import { implement } from "@plugins/infra/plugins/endpoints/server";
import { forkExclusions } from "@plugins/database/plugins/admin/server";
import { getForkExclusions } from "../../core/endpoints";

// Serve the collected exclusion set. `forkExclusions()` throws on an empty
// registry, which in a booted backend cannot happen — so a 500 here would mean
// the contributions never got collected, which is worth surfacing rather than
// answering with an empty set the caller would act on.
export const handleGetForkExclusions = implement(getForkExclusions, () => {
  const { tableData, schemas } = forkExclusions();
  return { tableData: [...tableData], schemas: [...schemas] };
});
