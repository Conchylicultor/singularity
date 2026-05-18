export type {
  ConversationGroup,
  ConversationGroupMember,
  ConversationGroupsPayload,
} from "./internal/schemas";
export {
  ConversationGroupSchema,
  ConversationGroupMemberSchema,
  ConversationGroupsPayloadSchema,
  conversationGroupsResource,
} from "./internal/schemas";
export {
  createConversationGroup,
  patchConversationGroup,
  deleteConversationGroup,
  addConversationGroupMembers,
  removeConversationGroupMember,
} from "./endpoints";
