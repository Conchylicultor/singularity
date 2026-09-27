import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { conversationTurnCompleted } from "@plugins/conversations/server";
import { pushLanded } from "@plugins/tasks/plugins/tasks-core/server";
import { classifyProgressJob } from "./internal/heuristic-job";
import { markProgressPushedJob } from "./internal/push-job";
import { conversationProgressRowsServed } from "./internal/resource";

export { conversationProgress } from "./internal/tables";
export { classifyProgressJob } from "./internal/heuristic-job";
export { markProgressPushedJob } from "./internal/push-job";

export default {
  description:
    "Tracks each conversation through four phases (research → design → implementation → pushed) via git heuristics: no files = research, only research/** = design, any other file = implementation, push event = pushed.",
  contributions: [
    ...conversationProgressRowsServed.declare,
    Trigger({
      on: conversationTurnCompleted,
      do: classifyProgressJob,
      with: {},
      oneShot: false,
    }),
    Trigger({
      on: pushLanded,
      do: markProgressPushedJob,
      with: {},
      oneShot: false,
    }),
  ],
  register: [classifyProgressJob, markProgressPushedJob],
} satisfies ServerPluginDefinition;
