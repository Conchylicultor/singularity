import type { FieldColumnMap } from "@plugins/primitives/plugins/data-view/plugins/server-query/server";
import { conversationsView as conversations } from "@plugins/tasks/plugins/tasks-core/server";

// Binds each CONVERSATION_FIELDS id → its physical `conversations_v` column, with
// the field-type token (resolving the operator→SQL builder) and `nullable` for the
// null-aware keyset seek. Unmapped filter/sort fields are dropped fail-soft by the
// compiler — never a 400.
export const COLUMN_MAP: FieldColumnMap = {
  title: { col: conversations.title, type: "text", nullable: true },
  status: { col: conversations.status, type: "enum" },
  model: { col: conversations.model, type: "enum" },
  kind: { col: conversations.kind, type: "enum" },
  runtime: { col: conversations.runtime, type: "text" },
  createdAt: { col: conversations.createdAt, type: "date" },
  endedAt: { col: conversations.endedAt, type: "date", nullable: true },
  worktreePath: { col: conversations.worktreePath, type: "text" },
};
