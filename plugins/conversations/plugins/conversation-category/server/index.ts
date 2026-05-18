import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { Config } from "@plugins/config/server";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { conversationTurnCompleted } from "@plugins/conversations/server";
import { conversationCategoryConfig } from "../shared/config";
import { classifyConversationJob } from "./internal/classify-job";
import { conversationCategoriesResource } from "./internal/resource";
import { categoryColorsResource } from "./internal/colors-resource";
import {
  handleClassify,
  handleClearCategory,
  handleSetCategory,
} from "./internal/routes";
import {
  handleGetColors,
  handleSetColor,
  handleDeleteColor,
} from "./internal/colors-routes";
import { backfillCategoryColorsSvgNodes } from "./internal/backfill-svg";
import {
  classifyConversation,
  setConversationCategory,
  clearConversationCategory,
  getCategoryColors,
  setCategoryColor,
  deleteCategoryColor,
} from "../shared/endpoints";

export { conversationCategoryConfig } from "../shared/config";
export { conversationCategory } from "./internal/tables";
export { _conversationCategoryColors } from "./internal/tables-colors";
export { conversationCategoriesResource } from "./internal/resource";
export { categoryColorsResource } from "./internal/colors-resource";
export { classifyConversationJob } from "./internal/classify-job";

export default {
  id: "conversation-category",
  name: "Conversation: Category",
  description:
    "Classifies each conversation into one of a configurable list of categories using Haiku. Surfaces the result as a chip in the sidebar row and the conversation toolbar.",
  contributions: [
    Config.Field(conversationCategoryConfig),
    Resource.Declare(conversationCategoriesResource),
    Resource.Declare(categoryColorsResource),
    Trigger({ on: conversationTurnCompleted, do: classifyConversationJob, with: {}, oneShot: false }),
  ],
  httpRoutes: {
    [classifyConversation.route]: handleClassify,
    [setConversationCategory.route]: handleSetCategory,
    [clearConversationCategory.route]: handleClearCategory,
    [getCategoryColors.route]: handleGetColors,
    [setCategoryColor.route]: handleSetColor,
    [deleteCategoryColor.route]: handleDeleteColor,
  },
  onReady: async () => {
    await backfillCategoryColorsSvgNodes();
  },
  register: [classifyConversationJob],
} satisfies ServerPluginDefinition;
