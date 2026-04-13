export {
  ConversationSchema,
  ConversationStatusSchema,
  type Conversation,
  type ConversationStatus,
} from "../server/schema";

export interface TmuxLive {
  task: string;
  idle: boolean;
}
