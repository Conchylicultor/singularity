export {
  ConversationSchema,
  ConversationStatusSchema,
  TERMINAL_STATUSES,
  isActiveStatus,
  type Conversation,
  type ConversationStatus,
} from "../server/schema";

export interface RuntimeLive {
  working: boolean;
}
