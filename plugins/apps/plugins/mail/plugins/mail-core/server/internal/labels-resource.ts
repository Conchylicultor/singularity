import { and, eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { mailLabelsResource } from "../../core";
import { _mailLabels } from "./tables";
import { resolveMailAccountId } from "./account";

// User labels for the connected account, ordered by name. Push-scoped to
// `mail_labels`, so every label upsert from the sync engine auto-pushes through
// the DB change-feed. Returns [] on a cold mailbox (no account yet) rather than
// throwing.
//
// The set is bounded by the mailbox's own label count (Gmail caps user labels at
// a low four figures), so a full-table read is the whole working set — not an
// unbounded collection resource.
export const mailLabelsServerResource = defineResource(mailLabelsResource, {
  mode: "push",
  identityTable: "mail_labels",
  loader: async () => {
    const accountId = await resolveMailAccountId();
    if (!accountId) return [];
    return db
      .select()
      .from(_mailLabels)
      .where(
        and(eq(_mailLabels.accountId, accountId), eq(_mailLabels.type, "user")),
      )
      .orderBy(_mailLabels.name);
  },
});
