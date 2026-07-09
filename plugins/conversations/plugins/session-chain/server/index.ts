import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { recordSessionId, listSessionChain } from "./internal/record";
export type { SessionChainEntry } from "./internal/record";

export default {
  description:
    "Append-only mapping of a conversation to the ordered Claude session ids it has run under. Knows nothing about transcript files.",
} satisfies ServerPluginDefinition;
