import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { conversationTurnCompleted } from "@plugins/conversations/server";
import { turnSummaryConfig } from "../shared/config";
import { generateTurnSummaryJob } from "./internal/job";
import { turnSummaryRowsServed } from "./internal/resource";

export { turnSummaries } from "./internal/tables";
export { generateTurnSummaryJob } from "./internal/job";

export default {
  description:
    "After every assistant turn, runs Haiku on the (user, assistant) pair to produce a one-line summary, caveats list, and actions list. Renders above the prompt input.",
  contributions: [
    ConfigV2.Register({ descriptor: turnSummaryConfig }),
    ...turnSummaryRowsServed.declare,
    Trigger({
      on: conversationTurnCompleted,
      do: generateTurnSummaryJob,
      with: {},
      oneShot: false,
    }),
  ],
  register: [generateTurnSummaryJob],
} satisfies ServerPluginDefinition;
