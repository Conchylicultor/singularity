import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { getProfile } from "./internal/profile";
export { listMessages, getMessage, batchGetMessages } from "./internal/messages";
export { getAttachment } from "./internal/attachments";
export { listHistory } from "./internal/history";
export { listLabels } from "./internal/labels";

export default {
  description:
    "Stateless typed Gmail REST API v1 client (profile, messages, history, labels) with concurrency-bounded batched gets and exponential backoff. Takes an access token per call; never touches auth or storage.",
  contributions: [],
} satisfies ServerPluginDefinition;
