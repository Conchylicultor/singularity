import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { mailSyncStateResource } from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { _mailSyncState } from "@plugins/apps/plugins/mail/plugins/mail-core/server";

// Live `mail_sync_state` table mirror — the UI reads sync progress + failures
// off this. A push resource scoped to its own table: every UPSERT/UPDATE from the
// sync jobs auto-pushes via the DB change-feed (no manual notify). `key` /
// `schema` come from the shared client descriptor; the server adds the DB half.
export const mailSyncStateServerResource = defineResource(mailSyncStateResource, {
  mode: "push",
  identityTable: "mail_sync_state",
  loader: async () => db.select().from(_mailSyncState),
});
