// In-plugin imports go straight to the leaf modules so the frontend bundle
// doesn't pull `server/api`'s runtime surface (which loads `claude-transcript`
// and other Node-only modules). Cross-plugin consumers must still go through
// `@plugins/conversations/server/api`.
export { ConversationSchema, type Conversation } from "@plugins/tasks-core/shared";
export { ConversationModelSchema, type ConversationModel } from "../server/model";
export {
  ConversationStatusSchema,
  isActiveStatus,
  type ConversationStatus,
} from "../server/status";
