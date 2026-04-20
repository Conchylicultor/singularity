// MIGRATION: view and schema moved to tasks-core — this stub keeps existing
// internal imports compiling. Remove in Phase 3 once all consumers use tasks-core.
export { conversations, ConversationSchema } from "@plugins/tasks-core/server/internal/schema";
export type { Conversation } from "@plugins/tasks-core/server/internal/schema";
