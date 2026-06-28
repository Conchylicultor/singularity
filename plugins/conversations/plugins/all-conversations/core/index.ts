export { CONVERSATION_FIELDS } from "./internal/fields";
export type { ConversationFieldSpec, ConversationFieldType } from "./internal/fields";
export {
  queryConversations,
  SortRuleSchema,
  QueryConversationsBodySchema,
  QueryConversationsResponseSchema,
} from "./internal/endpoints";
export type { QueryConversationsBody } from "./internal/endpoints";
export { conversationsRevisionResource } from "./internal/resources";
