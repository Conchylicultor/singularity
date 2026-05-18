import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Config } from "@plugins/config/server";
import { Trigger } from "@plugins/infra/plugins/events/server";
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
  contributions: [
    Config.Field(turnSummaryConfig),
    Resource.Declare(turnSummariesResource),
    Trigger({ on: conversationTurnCompleted, do: generateTurnSummaryJob, with: {}, oneShot: false }),
  ],
  register: [generateTurnSummaryJob],
} satisfies ServerPluginDefinition;
