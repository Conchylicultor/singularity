import { implement } from "@plugins/infra/plugins/endpoints/server";
import { ownedNamespacesEndpoint } from "../../shared/endpoints";

// Lazy for the same reason `handle-reset` is: the implementation reaches the
// reclaim primitive and through it `database/admin`, so loading it eagerly would
// put that graph on the backend boot path for a question only a delete asks. The
// route registration stays eager; only the handler body defers.
export const handleOwnedNamespaces = implement(
  ownedNamespacesEndpoint,
  async ({ query }) => {
    const { ownedNamespacesFor } = await import("./reclaim-composition");
    return { namespaces: await ownedNamespacesFor(query.composition) };
  },
);
