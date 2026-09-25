import {
  bindColumns,
  type FieldColumnMap,
} from "@plugins/primitives/plugins/data-view/plugins/server-query/server";
import { conversationsView as conversations } from "@plugins/tasks/plugins/tasks-core/server";
import { CONVERSATION_FILTERABLE } from "../../core";

// Binds every CONVERSATION_FILTERABLE column → its `conversations_v` column
// (domain copied from the declaration; a declared column with no binding is a
// tsc error), with `nullable` for the null-aware keyset seek. A filter naming
// anything else is refused with a 400 — never dropped.
export const COLUMN_MAP: FieldColumnMap = bindColumns(CONVERSATION_FILTERABLE, {
  title: { col: conversations.title, nullable: true },
  status: { col: conversations.status },
  model: { col: conversations.model },
  kind: { col: conversations.kind },
  runtime: { col: conversations.runtime },
  createdAt: { col: conversations.createdAt },
  updatedAt: { col: conversations.updatedAt },
  endedAt: { col: conversations.endedAt, nullable: true },
  worktreePath: { col: conversations.worktreePath },
});
