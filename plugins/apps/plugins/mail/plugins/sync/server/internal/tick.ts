import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { Log } from "@plugins/primitives/plugins/log-channels/server";
import { isGmailEnabled } from "@plugins/integrations/plugins/gmail/server";
import {
  _mailAccounts,
  _mailSyncState,
} from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import { eq } from "drizzle-orm";
import { ensureAccount } from "./bootstrap";
import { deltaJob } from "./delta";
import { recordSyncError } from "./record-error";

// Steady-state driver: the documented no-polling exception. Gmail push
// (users.watch → Pub/Sub) needs a public inbound HTTPS endpoint that a
// per-worktree backend behind the gateway cannot expose, so `history.list` is
// the only delta signal and must be pulled. This is a scheduled `defineJob`
// (main-only — perWorktree left unset, since sync hits shared external state and
// the canonical mailbox lives in main's DB), NOT an in-process setInterval.
//
// Each tick: auto-connect once Gmail is toggled on, then enqueue a delta for
// every account in a pull-ready state. Backfilling accounts self-continue via
// their own re-enqueue chain; errored accounts are left alone.
export const syncTickJob = defineJob({
  name: "mail.sync-tick",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "* * * * *" },
  maxAttempts: 3,
  run: async () => {
    if (!isGmailEnabled()) return;

    const accounts = await db
      .select({ id: _mailAccounts.id })
      .from(_mailAccounts);

    // Auto-connect on first toggle-on. `ensureAccount` records any failure onto
    // the account's sync_state row (→ surfaced live on the sync-status banner)
    // when it can attribute it. Swallow here — consistent with the per-account
    // "record and move on" handling below — so a terminal connection error
    // (api_disabled/auth) doesn't dead-letter the scheduled tick every minute;
    // the next cron tick retries. Logged to the `mail-sync` channel so it stays
    // observable in Debug → Logs.
    if (accounts.length === 0) {
      try {
        await ensureAccount();
      } catch (err) {
        Log.emit(
          "mail-sync",
          `first-connect bootstrap failed: ${err instanceof Error ? err.message : String(err)}`,
          "stderr",
        );
      }
      return;
    }

    for (const account of accounts) {
      // One account's failure must not abort the whole tick — record it on that
      // account's row and move on (errored/backfilling accounts are skipped).
      try {
        const [state] = await db
          .select({ status: _mailSyncState.status })
          .from(_mailSyncState)
          .where(eq(_mailSyncState.accountId, account.id))
          .limit(1);
        if (state && (state.status === "delta" || state.status === "idle")) {
          await deltaJob.enqueue({ accountId: account.id });
        }
      } catch (err) {
        await recordSyncError(account.id, err);
        continue;
      }
    }
  },
});
