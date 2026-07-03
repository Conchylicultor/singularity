import { asc, eq, sql } from "drizzle-orm";
import { queryResource } from "@plugins/infra/plugins/query-resource/server";
import { _mailMessages } from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import { threadMessagesResource } from "../../core";

// Compiled keyed query-resource scoped to `mail_messages`: the DB change-feed
// auto-pushes on any insert/update to a message in the open thread (a new reply,
// a flag change, a body hydration), so the pane stays live with no polling.
//
// K/scoped is sound. The per-param `where threadId = ?` is immutable (a message
// never moves threads) and the (internalDate, id) sort keys are insert-immutable,
// so a scoped in-place update never reorders — the reading pane renders
// `messages.map` in wire order (oldest→newest), and an in-place flag/hydration
// flip ships as one keyed row, not the whole list.
//
// Envelope-only: bodies are null on the stub rows and stay so here (select-all ≡
// the wire schema by construction) — the pane hydrates each message on first
// expand via `sync`'s `mailHydrateMessageEndpoint`. Ordered by `internal_date
// ASC NULLS FIRST, id ASC` so a message with no internal date (rare) sorts to
// the front deterministically.
export const threadMessagesServerResource = queryResource(
  threadMessagesResource,
  {
    from: _mailMessages,
    where: ({ threadId }) => eq(_mailMessages.threadId, threadId),
    orderBy: [
      sql`${_mailMessages.internalDate} asc nulls first`,
      asc(_mailMessages.id),
    ],
  },
);
