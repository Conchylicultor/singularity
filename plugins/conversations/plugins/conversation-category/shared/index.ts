export { conversationCategoryConfig } from "./config";
export {
  ConversationCategorySchema,
  ConversationCategoriesPayloadSchema,
  conversationCategoriesResource,
} from "./schemas";
export type {
  ConversationCategory,
  ConversationCategoriesPayload,
} from "./schemas";
export {
  classifyConversation,
  setConversationCategory,
  clearConversationCategory,
  getCategoryColors,
  setCategoryColor,
  deleteCategoryColor,
  SetCategoryBodySchema,
  SetColorBodySchema,
} from "./endpoints";
export type { SetCategoryBody, SetColorBody } from "./endpoints";
