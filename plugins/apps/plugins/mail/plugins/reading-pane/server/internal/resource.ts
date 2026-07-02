import { asc, eq, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { _mailMessages } from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import { threadMessagesResource } from "../../core";

// The messages of one thread, oldest→newest — the reading pane's live envelope
// list. A push resource scoped to `mail_messages`: the DB change-feed auto-pushes
// on any insert/update to a message in the open thread (a new reply, a flag
// change, a body hydration), so the pane stays live with no polling. `key` +
// `schema` come from the shared descriptor; the server adds the DB loader half.
//
// Envelope-only: bodies are null on the stub rows and stay so here — the pane
// hydrates each message on first expand via `sync`'s `mailHydrateMessageEndpoint`
// (cached thereafter). Ordered by `internal_date ASC NULLS FIRST, id ASC` so a
// message with no internal date (rare) sorts to the front deterministically.
export const threadMessagesServerResource = defineResource(
  threadMessagesResource,
  {
    mode: "push",
    identityTable: "mail_messages",
    loader: async ({ threadId }) =>
      db
        .select()
        .from(_mailMessages)
        .where(eq(_mailMessages.threadId, threadId))
        .orderBy(
          sql`${_mailMessages.internalDate} asc nulls first`,
          asc(_mailMessages.id),
        ),
  },
);
