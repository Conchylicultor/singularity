import type { ServerPluginDefinition } from "@server/types";
import {
  deleteTriggersFor,
  trigger,
} from "@plugins/infra/plugins/events/server";
import { conversationTurnCompleted } from "@plugins/conversations/server";
import { pushLanded } from "@plugins/tasks-core/server";
import { classifyProgressJob } from "./internal/haiku-job";
import { markProgressPushedJob } from "./internal/push-job";
import { conversationProgressResource } from "./internal/resource";

export { _conversationProgress } from "./internal/tables";
export { conversationProgressResource } from "./internal/resource";
export { classifyProgressJob } from "./internal/haiku-job";
export { markProgressPushedJob } from "./internal/push-job";

export default {
  id: "conversation-progress",
  name: "Conversation: Progress",
  description:
    "Classifies each conversation into one of four sequential phases (research → plan → implementation → pushed) using Haiku after each turn, and immediately sets pushed when a push event lands.",
  resources: [conversationProgressResource],
  onReady: async () => {
    await deleteTriggersFor(classifyProgressJob);
    await trigger({
      on: conversationTurnCompleted,
      do: classifyProgressJob,
      with: {},
      oneShot: false,
    });
    await deleteTriggersFor(markProgressPushedJob);
    await trigger({
      on: pushLanded,
      do: markProgressPushedJob,
      with: {},
      oneShot: false,
    });
  },
} satisfies ServerPluginDefinition;
