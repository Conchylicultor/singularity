import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { conversationTurnCompleted } from "@plugins/conversations/server";
import { conversationCategoryConfig } from "../shared/config";
import { classifyConversationJob } from "./internal/classify-job";
import { conversationCategoriesResource } from "./internal/resource";
import {
  handleClassify,
  handleClearCategory,
  handleSetCategory,
} from "./internal/routes";
import {
  classifyConversation,
  setConversationCategory,
  clearConversationCategory,
} from "../shared/endpoints";

export { conversationCategoryConfig } from "../shared/config";
export { conversationCategory } from "./internal/tables";
export { conversationCategoriesResource } from "./internal/resource";
export { classifyConversationJob } from "./internal/classify-job";

export default {
  description:
    "Classifies each conversation into one of a configurable list of categories using Haiku. Surfaces the result as a chip in the sidebar row and the conversation toolbar.",
  contributions: [
    ConfigV2.Register({ descriptor: conversationCategoryConfig }),
    Resource.Declare(conversationCategoriesResource),
    Trigger({ on: conversationTurnCompleted, do: classifyConversationJob, with: {}, oneShot: false }),
  ],
  httpRoutes: {
    [classifyConversation.route]: handleClassify,
    [setConversationCategory.route]: handleSetCategory,
    [clearConversationCategory.route]: handleClearCategory,
  },
  register: [classifyConversationJob],
} satisfies ServerPluginDefinition;
