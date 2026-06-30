import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import {
  getProfile,
  listLabels,
} from "@plugins/apps/plugins/mail/plugins/gmail-api/server";
import {
  _mailAccounts,
  _mailSyncState,
  requireGmailToken,
} from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import { backfillJob } from "./backfill";
import { upsertLabels } from "./store";
import { recordSyncError } from "./record-error";

// Idempotent first-connect: resolve the Gmail account, mirror its labels, and
// arm the sync state machine. Safe to call repeatedly (the manual endpoint and
// the scheduled tick both do) — an existing sync_state row is never reset.
//
// Capturing profile.historyId BEFORE the (possibly long) backfill means any
// change during backfill is caught by the first delta from that watermark.
export async function ensureAccount(): Promise<{
  accountId: string;
  status: string;
}> {
  // Throws loudly if Gmail isn't connected/enabled. Attribute a token failure to
  // every existing account so a manual "sync now" surfaces it on the row(s);
  // first-connect has no account yet, so the error simply propagates.
  let token: string;
  try {
    token = await requireGmailToken();
  } catch (err) {
    const accounts = await db
      .select({ id: _mailAccounts.id })
      .from(_mailAccounts);
    for (const a of accounts) await recordSyncError(a.id, err);
    throw err;
  }
  const profile = await getProfile(token);

  // Find-or-create the account by email.
  const [existing] = await db
    .select({ id: _mailAccounts.id })
    .from(_mailAccounts)
    .where(eq(_mailAccounts.email, profile.emailAddress))
    .limit(1);
  let accountId: string;
  if (existing) {
    accountId = existing.id;
  } else {
    accountId = randomUUID();
    await db.insert(_mailAccounts).values({
      id: accountId,
      email: profile.emailAddress,
      name: null,
      connectedAt: new Date(),
    });
  }

  await upsertLabels(accountId, await listLabels(token));

  // Arm sync_state on first connect; never restart an in-progress backfill.
  const [syncRow] = await db
    .select({ status: _mailSyncState.status })
    .from(_mailSyncState)
    .where(eq(_mailSyncState.accountId, accountId))
    .limit(1);
  if (syncRow) {
    return { accountId, status: syncRow.status };
  }

  await db.insert(_mailSyncState).values({
    accountId,
    historyId: profile.historyId,
    status: "backfilling",
  });
  await backfillJob.enqueue({ accountId });
  return { accountId, status: "backfilling" };
}
