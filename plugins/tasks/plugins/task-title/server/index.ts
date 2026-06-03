import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Trigger } from "@plugins/infra/plugins/events/server";
import {
  conversationCreated,
  userTurnSent,
} from "@plugins/conversations/server";
import {
  titleOnConversationCreatedJob,
  titleOnUserTurnSentJob,
} from "./internal/title-subscribers";

export {
  generateTaskTitle,
  scheduleTaskTitleUpdate,
  scheduleTaskTitleUpgrade,
  synthesiseTitleFallback,
} from "./internal/generate-title";

export default {
  name: "Tasks: Task Title",
  description:
    "Haiku-backed task title generation. Upgrades uninformative titles asynchronously via event subscribers so task/conversation creation never blocks on the Claude CLI round-trip.",
  register: [titleOnConversationCreatedJob, titleOnUserTurnSentJob],
  contributions: [
    Trigger({ on: conversationCreated, do: titleOnConversationCreatedJob, with: {}, oneShot: false }),
    Trigger({ on: userTurnSent, do: titleOnUserTurnSentJob, with: {}, oneShot: false }),
  ],
} satisfies ServerPluginDefinition;
