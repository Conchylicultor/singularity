import { defineIdKind, type IdOf } from "@plugins/ids/core";

/**
 * A conversation summary's id (`conversation_summaries.id`), declared once
 * (`plugins/ids`). Rows minted as `summary-<ms>-<6>` stay recognised.
 */
export const summaryIdKind = defineIdKind({
  prefix: "summary",
  label: "Conversation summary",
});

export type SummaryId = IdOf<typeof summaryIdKind>;
