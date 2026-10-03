import {
  ConversationStatusSchema,
  ConversationKindSchema,
} from "@plugins/tasks/plugins/tasks-core/core";
import {
  liveInstant,
  liveText,
} from "@plugins/network/plugins/live/plugins/filter/core";
import {
  compareModelsNewestFirst,
  isPrintOnlyFamily,
  modelMeta,
  type ModelCatalog,
} from "@plugins/conversations/plugins/model-provider/core";

// The single shared field vocabulary driving BOTH the web `FieldDef[]` (added
// `value`/`cell` accessors) and the live collections' declarations (what the
// server filters and sorts on), so the two runtimes can never drift on which dimensions exist, what
// type they are, or what enum choices they offer. Plain data only (browser-safe)
// — no React, no drizzle.
export type ConversationFieldType = "text" | "enum" | "date";

export interface ConversationFieldSpec {
  id: string;
  label: string;
  type: ConversationFieldType;
  /** Sortable in the toolbar Sort pill — exactly `CONVERSATION_SORTABLE`. */
  sortable?: boolean;
  /** The column may be NULL. */
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
/**
 * The model filter's options: a conversation's model is the concrete version
 * it RAN, so the filter offers versions, never families — every version the
 * catalog knows, retired ones included (old conversations ran them), newest
 * first. Runtime data, so it is not part of the static field vocabulary below:
 * the web schema fills the `model` field's options from the live catalog
 * (`useConversationFieldDefs`).
 */
export function conversationModelOptions(
  catalog: ModelCatalog,
): { value: string; label: string }[] {
  return catalog.versions
    .map((v) => v.id)
    .filter((id) => !isPrintOnlyFamily(modelMeta(id).family))
    .sort(compareModelsNewestFirst)
    .map((id) => ({ value: id, label: modelMeta(id).label }));
}

export const CONVERSATION_FIELDS = [
  {
    id: "title",
    label: "Title",
    type: "text",
    sortable: true,
    primary: true,
    nullable: true,
  },
  { id: "status", label: "Status", type: "enum", options: statusOptions },
  // Options from the live catalog: see `conversationModelOptions`.
  { id: "model", label: "Model", type: "enum" },
  { id: "kind", label: "Kind", type: "enum", options: kindOptions },
  { id: "runtime", label: "Runtime", type: "text" },
  { id: "createdAt", label: "Created", type: "date", sortable: true },
  // Last activity. Sortable: it is DERIVED (a DB trigger) and moves only on a
  // title / model edit and the working ⇄ reply status transitions — never on
  // the status reconciler's `waitingFor` / `lastViewedAt` writes — so a live window
  // ordered by it re-sorts on real activity only.
  { id: "updatedAt", label: "Updated", type: "date", sortable: true },
  { id: "endedAt", label: "Ended", type: "date", nullable: true },
  { id: "worktreePath", label: "Worktree", type: "text" },
  // The owning task's CURRENT title (joined live: a task rename reaches every
  // list holding its conversations). Searchable and filterable; no facet — a
  // facet over a joined text column would recount on every rename.
  { id: "taskTitle", label: "Task", type: "text" },
] as const satisfies readonly ConversationFieldSpec[];

/**
 * What the lists sort by — exactly the fields marked `sortable` above (a test
 * pins the two equal: a field marked sortable over a column the collection
 * does not sort throws at mount, on both surfaces).
 */
export const CONVERSATION_SORTABLE = [
  "title",
  "createdAt",
  "updatedAt",
] as const;

/**
 * What the lists filter on, by filter-language domain — the conversation
 * collections' `filterable` (`allConversations`, `conversationHistory`), so the
 * DataView's Filter control offers exactly these and the server strict-decodes
 * against them.
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
  taskTitle: liveText(),
};

/** The text columns the search box matches (any of, case-insensitively). */
export const CONVERSATION_SEARCHABLE = [
  "title",
  "model",
  "worktreePath",
  "taskTitle",
] as const;
