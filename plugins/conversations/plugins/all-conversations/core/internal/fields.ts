import {
  ConversationStatusSchema,
  ConversationKindSchema,
} from "@plugins/tasks/plugins/tasks-core/core";
import {
  liveInstant,
  liveText,
} from "@plugins/network/plugins/live/plugins/filter/core";
import {
  SELECTABLE_CHOICES,
  isModelFamily,
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
// A conversation's model is the concrete version it ran, so the filter offers
// versions, never families.
const modelOptions = SELECTABLE_CHOICES.filter((m) => !isModelFamily(m)).map(
  (m) => ({
    value: m,
    label: modelDisplayLabel(m),
  }),
);

export const CONVERSATION_FIELDS: ConversationFieldSpec[] = [
  {
    id: "title",
    label: "Title",
    type: "text",
    sortable: true,
    primary: true,
    nullable: true,
  },
  { id: "status", label: "Status", type: "enum", options: statusOptions },
  { id: "model", label: "Model", type: "enum", options: modelOptions },
  { id: "kind", label: "Kind", type: "enum", options: kindOptions },
  { id: "runtime", label: "Runtime", type: "text" },
  { id: "createdAt", label: "Created", type: "date", sortable: true },
  // Last activity. Deliberately NOT sortable: the poller bumps it up to ~1/s and
  // the History revision tick ignores it, so a server keyset sort on it would go
  // stale. Filterable (the Queue's default fold keeps rows updated recently).
  { id: "updatedAt", label: "Updated", type: "date" },
  { id: "endedAt", label: "Ended", type: "date", nullable: true },
  { id: "worktreePath", label: "Worktree", type: "text" },
];

/**
 * What the server can filter on, by filter-language domain — the ONE
 * declaration both runtimes read: the web `dataSource.filterable` (so the
 * Filter control offers exactly these fields) and the server column map
 * (`bindColumns`) the handler strict-decodes against. A field missing here is
 * not filterable server-side, and so is not offered.
 */
export const CONVERSATION_FILTERABLE = {
  title: liveText(),
  status: liveText(ConversationStatusSchema),
  model: liveText(),
  kind: liveText(ConversationKindSchema),
  runtime: liveText(),
  createdAt: liveInstant(),
  updatedAt: liveInstant(),
  endedAt: liveInstant(),
  worktreePath: liveText(),
};

/** The text columns the search box matches (any of, case-insensitively). */
export const CONVERSATION_SEARCHABLE = [
  "title",
  "model",
  "worktreePath",
] as const;
