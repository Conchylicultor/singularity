import type { ServerPluginDefinition } from "@server/types";
import { Resource } from "@server/resources";
import {
  deleteTriggersFor,
  trigger,
} from "@plugins/infra/plugins/events/server";
import { conversationTurnCompleted } from "@plugins/conversations/server";
import { pushLanded } from "@plugins/tasks-core/server";
import { classifyProgressJob } from "./internal/heuristic-job";
import { markProgressPushedJob } from "./internal/push-job";
import { conversationProgressResource } from "./internal/resource";

export { conversationProgress } from "./internal/tables";
export { conversationProgressResource } from "./internal/resource";
export { classifyProgressJob } from "./internal/heuristic-job";
export { markProgressPushedJob } from "./internal/push-job";

export default {
  id: "conversation-progress",
  name: "Conversation: Progress",
  description:
    "Tracks each conversation through four phases (research → design → implementation → pushed) via git heuristics: no files = research, only research/** = design, any other file = implementation, push event = pushed.",
  contributions: [Resource.Declare(conversationProgressResource)],
  register: [classifyProgressJob, markProgressPushedJob],
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
