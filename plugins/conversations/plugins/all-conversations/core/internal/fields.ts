import {
  ConversationStatusSchema,
  ConversationKindSchema,
} from "@plugins/tasks/plugins/tasks-core/core";
import {
  SELECTABLE_MODELS,
  modelDisplayLabel,
} from "@plugins/conversations/plugins/model-provider/core";

// The single shared field vocabulary driving BOTH the web `FieldDef[]` (added
// `value`/`cell` accessors) and the server `FieldColumnMap` (added drizzle
// columns), so the two runtimes can never drift on which dimensions exist, what
// type they are, or what enum choices they offer. Plain data only (browser-safe)
// — no React, no drizzle.
export type ConversationFieldType = "text" | "enum" | "date";

export interface ConversationFieldSpec {
  id: string;
  label: string;
  type: ConversationFieldType;
  /** Sortable in the toolbar Sort pill (also the keyset-sortable set). */
  sortable?: boolean;
  /** Column may be NULL — drives null-aware keyset seek terms server-side. */
  nullable?: boolean;
  /** Tree/primary label field (the one rendered as the row title). */
  primary?: boolean;
  /** enum choices — drives the Filter pill multiselect. */
  options?: { value: string; label: string }[];
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const statusOptions = ConversationStatusSchema.options.map((s) => ({
  value: s,
  label: cap(s),
}));
const kindOptions = ConversationKindSchema.options.map((k) => ({
  value: k,
  label: cap(k),
}));
const modelOptions = SELECTABLE_MODELS.map((m) => ({
  value: m,
  label: modelDisplayLabel(m),
}));

export const CONVERSATION_FIELDS: ConversationFieldSpec[] = [
  { id: "title", label: "Title", type: "text", sortable: true, primary: true, nullable: true },
  { id: "status", label: "Status", type: "enum", options: statusOptions },
  { id: "model", label: "Model", type: "enum", options: modelOptions },
  { id: "kind", label: "Kind", type: "enum", options: kindOptions },
  { id: "runtime", label: "Runtime", type: "text" },
  { id: "createdAt", label: "Created", type: "date", sortable: true },
  { id: "endedAt", label: "Ended", type: "date", nullable: true },
  { id: "worktreePath", label: "Worktree", type: "text" },
];
