import { text } from "drizzle-orm/pg-core";
import { defineTriggerEvent } from "@plugins/infra/plugins/events/server";

// Payload announced whenever a document's block set changes (create / update /
// delete / move / split / merge / indent / outdent). Subscribers (e.g. the
// links plugin's backlinks reindexer) bind a job via `trigger()`. Filtered by
// `documentId` so a subscriber can scope to one document, though the reindex
// job binds match-any and dispatches per affected document.
export interface BlocksChangedPayload {
  documentId: string;
  [key: string]: unknown;
}

export const { event: blocksChanged, table: _blocksChangedTriggers } =
  defineTriggerEvent<BlocksChangedPayload>({
    name: "page.blocksChanged",
    filters: {
      documentId: text("document_id"),
    },
  });
