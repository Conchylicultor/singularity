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
export { conversationCategoriesResource } from "./internal/resource";
export { classifyConversationJob } from "./internal/classify-job";
// The generic category API. Consumers (stats) enumerate categories through it
// and never name one, so adding or removing a category needs no edit there.
export { getCategories, getItemOrder, getAvatarCategoryId } from "./internal/categories";
export type { CategoryDescriptor } from "./internal/categories";
export { getItemMap } from "./internal/store";

export default {
  description:
    "Classifies each conversation along a user-defined set of categories using Haiku, one item per category. Surfaces one chip per category in the conversation header, and paints the sidebar avatar from the category chosen for it.",
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
