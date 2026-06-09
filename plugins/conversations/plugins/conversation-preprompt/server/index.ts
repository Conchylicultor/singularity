import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { conversationCreated } from "@plugins/conversations/server";
import { conversationPrepromptsResource } from "./internal/resource";
import { recordPrepromptJob } from "./internal/record-job";

export { conversationPreprompt } from "./internal/tables";
export { conversationPrepromptsResource } from "./internal/resource";
export { recordConversationPreprompt } from "./internal/record";
export { recordPrepromptJob } from "./internal/record-job";

export default {
  description:
    "Snapshots the launching task's selected preprompt (id + title + text) onto each newly created conversation, surfaced as a chip in the conversation header.",
  contributions: [
    Resource.Declare(conversationPrepromptsResource),
    Trigger({ on: conversationCreated, do: recordPrepromptJob, with: {}, oneShot: false }),
  ],
  register: [recordPrepromptJob],
} satisfies ServerPluginDefinition;
