import type { ServerPluginDefinition } from "@server/types";
import {
  deleteTriggersFor,
  trigger,
} from "@plugins/infra/plugins/events/server";
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
  id: "tasks-task-title",
  name: "Tasks: Task Title",
  description:
    "Haiku-backed task title generation. Upgrades uninformative titles asynchronously via event subscribers so task/conversation creation never blocks on the Claude CLI round-trip.",
  register: [titleOnConversationCreatedJob, titleOnUserTurnSentJob],
  onReady: async () => {
    await deleteTriggersFor(titleOnConversationCreatedJob);
    await trigger({
      on: conversationCreated,
      do: titleOnConversationCreatedJob,
      with: {},
      oneShot: false,
    });

    await deleteTriggersFor(titleOnUserTurnSentJob);
    await trigger({
      on: userTurnSent,
      do: titleOnUserTurnSentJob,
      with: {},
      oneShot: false,
    });
  },
} satisfies ServerPluginDefinition;
