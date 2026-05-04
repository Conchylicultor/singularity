import type { ServerPluginDefinition } from "@server/types";
import {
  deleteTriggersFor,
  trigger,
} from "@plugins/infra/plugins/events/server";
import { conversationTurnCompleted } from "@plugins/conversations/server";
import { turnSummaryConfig } from "../shared/config";
import { generateTurnSummaryJob } from "./internal/job";
import { turnSummariesResource } from "./internal/resource";

export { turnSummaries } from "./internal/tables";
export { turnSummariesResource } from "./internal/resource";
export { generateTurnSummaryJob } from "./internal/job";

export default {
  id: "turn-summary",
  name: "Conversation View: Turn Summary",
  description:
    "After every assistant turn, runs Haiku on the (user, assistant) pair to produce a one-line summary, caveats list, and actions list. Renders above the prompt input.",
  config: turnSummaryConfig,
  resources: [turnSummariesResource],
  register: [generateTurnSummaryJob],
  onReady: async () => {
    // Idempotent re-subscribe: drop any stale conversationTurnCompleted →
    // generateTurnSummaryJob trigger rows from a prior incarnation, then
    // install one persistent (oneShot:false) trigger so every turn completion
    // for any conversation tries to summarize. The job is idempotent on
    // (conversationId, messageId) so re-fires are safe.
    await deleteTriggersFor(generateTurnSummaryJob);
    await trigger({
      on: conversationTurnCompleted,
      do: generateTurnSummaryJob,
      with: {},
      oneShot: false,
    });
  },
} satisfies ServerPluginDefinition;
