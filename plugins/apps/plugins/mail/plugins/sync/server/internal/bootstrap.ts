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

/** Find-or-create the account row for `email`, returning its id. */
async function findOrCreateAccount(email: string): Promise<string> {
  const [existing] = await db
    .select({ id: _mailAccounts.id })
    .from(_mailAccounts)
    .where(eq(_mailAccounts.email, email))
    .limit(1);
  if (existing) return existing.id;
  const accountId = randomUUID();
  await db.insert(_mailAccounts).values({
    id: accountId,
    email,
    name: null,
    connectedAt: new Date(),
  });
  return accountId;
}

// Idempotent first-connect: resolve the Gmail account, mirror its labels, and
// arm the sync state machine. Safe to call repeatedly (the manual endpoint and
// the scheduled tick both do) — an already-watermarked sync_state row is never
// reset.
//
// The account row is created from the connected Google email (known from the
// OAuth identity, *without* a Gmail API call) BEFORE the first Gmail API call,
// so a bootstrap-time failure (e.g. `403 accessNotConfigured` / API disabled, or
// insufficient scopes) has a real `mail_sync_state` row to attach its classified
// error to — and thus reaches the sync-status banner instead of vanishing into
// dead jobs. `profile.historyId` is captured here as the INITIAL watermark; the
// backfill then renews it on every page (interleaved `history.list` catch-up),
// so it can never outlive Gmail's history window and every change during
// backfill is applied as it happens — see `backfill.ts` / `history-sync.ts`.
export async function ensureAccount(): Promise<{
  accountId: string;
  status: string;
}> {
  // Throws loudly if Gmail isn't connected/enabled. Attribute a token failure to
  // every existing account so a manual "sync now" surfaces it on the row(s);
  // true first-connect has no account yet (and no email on failure), so the error
  // propagates — that genuine-disconnection case is the landing empty-state's
  // domain, not the banner's.
  let accessToken: string;
  let email: string | null;
  try {
    ({ accessToken, email } = await requireGmailToken());
  } catch (err) {
    const accounts = await db
      .select({ id: _mailAccounts.id })
      .from(_mailAccounts);
    for (const a of accounts) await recordSyncError(a.id, err);
    throw err;
  }

  // Establish the row up front from the OAuth email when available (for Google
  // the identity email IS the mailbox address). When it isn't surfaced — which
  // shouldn't happen once the Gmail scope is granted — fall back to the profile
  // email inside the try below (legacy path).
  let accountId = email != null ? await findOrCreateAccount(email) : null;

  try {
    const profile = await getProfile(accessToken);
    if (accountId == null) {
      accountId = await findOrCreateAccount(profile.emailAddress);
    }

    await upsertLabels(accountId, await listLabels(accessToken));

    // Arm (or re-arm) the sync state machine. A row that exists only as an
    // unarmed error placeholder (`historyId` still null — written by
    // recordSyncError before any watermark was captured) is re-armed here with a
    // fresh watermark and its error cleared, so enabling the API + "Retry now"
    // recovers cleanly. An already-watermarked row is never restarted.
    const [syncRow] = await db
      .select({
        status: _mailSyncState.status,
        historyId: _mailSyncState.historyId,
      })
      .from(_mailSyncState)
      .where(eq(_mailSyncState.accountId, accountId))
      .limit(1);
    if (syncRow && syncRow.historyId != null) {
      return { accountId, status: syncRow.status };
    }

    const armed = {
      historyId: profile.historyId,
      status: "backfilling" as const,
      errorCode: null,
      lastError: null,
      lastErrorAt: null,
      updatedAt: new Date(),
    };
    await db
      .insert(_mailSyncState)
      .values({ accountId, ...armed })
      .onConflictDoUpdate({ target: _mailSyncState.accountId, set: armed });
    await backfillJob.enqueue({ accountId });
    return { accountId, status: "backfilling" };
  } catch (err) {
    // The account row now exists, so a Gmail API failure here lands on its
    // sync_state row (→ surfaced live on the banner) before propagating loudly.
    if (accountId != null) await recordSyncError(accountId, err);
    throw err;
  }
}
