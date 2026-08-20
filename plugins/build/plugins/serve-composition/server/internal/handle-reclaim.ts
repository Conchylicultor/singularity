import { implement } from "@plugins/infra/plugins/endpoints/server";
import { reclaimCompositionNamespaces } from "../../shared/endpoints";

// Lazy-loaded body (see `handle-reset`). A guard refusal on the REQUESTED id
// (`assertServableCompositionNamespace`) throws and surfaces as a 500 — a refused
// reclaim is a genuine error, not a 4xx the UI absorbs, and nothing was touched.
// Per-NAMESPACE outcomes are different: they come back in the 200 body, because
// some namespaces may have been reclaimed and a non-2xx would deny that.
export const handleReclaim = implement(
  reclaimCompositionNamespaces,
  async ({ body }) => {
    const { reclaimCompositionData } = await import("./reclaim-composition");
    return { results: await reclaimCompositionData(body.id) };
  },
);
