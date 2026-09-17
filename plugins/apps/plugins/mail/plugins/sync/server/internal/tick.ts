import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineJob } from "@plugins/infra/plugins/jobs/server";
import { isGmailEnabled } from "@plugins/integrations/plugins/gmail/server";
import {
  _mailAccounts,
  _mailSyncState,
} from "@plugins/apps/plugins/mail/plugins/mail-core/server";
import { eq } from "drizzle-orm";
import { ensureAccount } from "./bootstrap";
import { planSyncTick } from "./tick-plan";
import { deltaJob } from "./delta";
import { recordSyncError } from "./record-error";
import { mailSyncLog } from "./sink";

// Steady-state driver: the documented no-polling exception. Gmail push
// (users.watch → Pub/Sub) needs a public inbound HTTPS endpoint that a
// per-worktree backend behind the gateway cannot expose, so `history.list` is
// the only delta signal and must be pulled. This is a scheduled `defineJob`
// (main-only — perWorktree left unset, since sync hits shared external state and
// the canonical mailbox lives in main's DB), NOT an in-process setInterval.
//
// Each tick: auto-connect once Gmail is toggled on (or re-arm an account with
// no sync-state row), then enqueue a delta for every account in a pull-ready
// state. Backfilling accounts self-continue via their own re-enqueue chain;
// errored accounts are left alone.
export const syncTickJob = defineJob({
  name: "mail.sync-tick",
  // instant, and it looks slow twice over. The body only selects accounts and
  // enqueues a delta per account — every Gmail call happens in `mail.delta`,
  // not here. Its measured ~1.5s mean is ~85% `background-acquire` wait, which
  // is hold, not work, and the class is declared on work.
  hold: "instant",
  input: z.object({}),
  event: z.never(),
  dedup: "singleton",
  schedule: { cron: "* * * * *" },
  maxAttempts: 3,
  run: async () => {
    if (!isGmailEnabled()) return;

    // Every account with its sync-state status (`null` when it has no row).
    const accounts = await db
      .select({ id: _mailAccounts.id, status: _mailSyncState.status })
      .from(_mailAccounts)
      .leftJoin(_mailSyncState, eq(_mailSyncState.accountId, _mailAccounts.id));
    const plan = planSyncTick(accounts);

    // Auto-connect on first toggle-on, and re-arm an account whose sync-state
    // row is missing (a restore from backup: the row is left out together with
    // the corpus it watermarks — see ./tick-plan). `ensureAccount` records any
    // failure onto the account's sync_state row (→ surfaced live on the
    // sync-status banner) when it can attribute it. Swallow here — consistent
    // with the per-account "record and move on" handling below — so a terminal
    // connection error (api_disabled/auth) doesn't dead-letter the scheduled
    // tick every minute; the next cron tick retries. Logged to the `mail-sync`
    // channel so it stays observable in Debug → Logs.
    if (plan.bootstrap) {
      try {
        await ensureAccount();
      } catch (err) {
        const what =
          accounts.length === 0
            ? "first-connect bootstrap"
            : "bootstrap of an account with no sync state";
        mailSyncLog.publish(
          `${what} failed: ${err instanceof Error ? err.message : String(err)}`,
          "stderr",
        );
      }
    }

    for (const accountId of plan.delta) {
      // One account's failure must not abort the whole tick — record it on that
      // account's row and move on.
      try {
        await deltaJob.enqueue({ accountId });
      } catch (err) {
        await recordSyncError(accountId, err);
      }
    }
  },
});
