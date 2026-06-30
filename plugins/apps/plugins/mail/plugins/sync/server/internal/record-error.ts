import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _mailSyncState } from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import { backfillJob } from "./backfill";
import { deltaJob } from "./delta";
import { classifyMailSyncError } from "./classify-error";

// Persist sync failures + clear-and-restart on a manual retry. Writing the error
// onto `mail_sync_state` makes it survive a restart and (via the DB change-feed)
// pushes it live to the UI through `mailSyncStateServerResource`.

/**
 * Classify `err` and record it onto the account's sync_state row (upserting the
 * row if it doesn't exist yet). A terminal failure also flips `status` to
 * `"error"`; a transient one leaves the status alone (graphile keeps retrying).
 */
export async function recordSyncError(
  accountId: string,
  err: unknown,
): Promise<void> {
  const c = classifyMailSyncError(err);
  const now = new Date();
  const errorFields = {
    errorCode: c.code,
    lastError: c.message,
    lastErrorAt: now,
    updatedAt: now,
    ...(c.terminal ? { status: "error" as const } : {}),
  };
  await db
    .insert(_mailSyncState)
    .values({ accountId, ...errorFields })
    .onConflictDoUpdate({
      target: _mailSyncState.accountId,
      set: errorFields,
    });
}

/**
 * Clear any recorded error and restart the appropriate sync job. If the account
 * already has a watermark it resumes steady-state delta; otherwise it restarts
 * the backfill from the beginning. No-op when the account has no sync_state row
 * yet (the manual endpoint's bootstrap path arms it on first connect).
 */
export async function kickSync(accountId: string): Promise<void> {
  const [row] = await db
    .select({ historyId: _mailSyncState.historyId })
    .from(_mailSyncState)
    .where(eq(_mailSyncState.accountId, accountId))
    .limit(1);
  if (!row) return;

  const cleared = {
    errorCode: null,
    lastError: null,
    lastErrorAt: null,
    updatedAt: new Date(),
  };
  if (row.historyId != null) {
    await db
      .update(_mailSyncState)
      .set({ ...cleared, status: "delta" })
      .where(eq(_mailSyncState.accountId, accountId));
    await deltaJob.enqueue({ accountId });
  } else {
    await db
      .update(_mailSyncState)
      .set({ ...cleared, status: "backfilling" })
      .where(eq(_mailSyncState.accountId, accountId));
    await backfillJob.enqueue({ accountId });
  }
}
