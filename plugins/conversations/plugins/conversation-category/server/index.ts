import type { ServerPluginDefinition } from "@server/types";
import {
  deleteTriggersFor,
  trigger,
} from "@plugins/infra/plugins/events/server";
import { conversationTurnCompleted } from "@plugins/conversations/server";
import { conversationCategoryConfig } from "../shared/config";
import { classifyConversationJob } from "./internal/classify-job";
import { conversationCategoriesResource } from "./internal/resource";
import {
  handleClassify,
  handleClearCategory,
  handleSetCategory,
} from "./internal/routes";

export { _conversationCategories } from "./internal/tables";
export { conversationCategoriesResource } from "./internal/resource";
export { classifyConversationJob } from "./internal/classify-job";

export default {
  id: "conversation-category",
  name: "Conversation: Category",
  description:
    "Classifies each conversation into one of a configurable list of categories using Haiku. Surfaces the result as a chip in the sidebar row and the conversation toolbar.",
  config: conversationCategoryConfig,
  resources: [conversationCategoriesResource],
  httpRoutes: {
    "POST /api/conversation-category/:conversationId/classify": handleClassify,
    "POST /api/conversation-category/:conversationId": handleSetCategory,
    "DELETE /api/conversation-category/:conversationId": handleClearCategory,
  },
  onReady: async () => {
    // Idempotent re-subscribe: drop any stale conversationTurnCompleted →
    // classifyConversationJob trigger rows from a prior incarnation, then
    // install one persistent (oneShot:false) trigger so every turn completion
    // for any conversation tries to classify (job no-ops if already done).
    await deleteTriggersFor(classifyConversationJob);
    await trigger({
      on: conversationTurnCompleted,
      do: classifyConversationJob,
      with: {},
      oneShot: false,
    });
  },
} satisfies ServerPluginDefinition;
