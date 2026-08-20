import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export {
  reclaimNamespace,
  NamespaceReclaimError,
} from "./internal/reclaim-namespace";
export {
  listCompositionNamespaces,
  namespacesOwnedByCheckout,
  namespacesOwnedByComposition,
} from "./internal/owned-namespaces";
export type { OwnedNamespace } from "./internal/owned-namespaces";

export default {
  description:
    "Namespace reclaim: reclaimNamespace tears down one compose-serve namespace's four artifacts (database, config dir, gateway registry dir, and the composing checkout's filtered registries) behind provenance guards, and the marker-driven ownership queries answer what a checkout or a composition owns — so a reclaim trigger asks rather than enumerating.",
} satisfies ServerPluginDefinition;
