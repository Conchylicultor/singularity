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
import { deltaJob } from "./delta";

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

    // Auto-connect on first toggle-on. Any token failure propagates (the tick
    // fails visibly in the queue debug pane — the correct, loud behavior).
    if (accounts.length === 0) {
      await ensureAccount();
      return;
    }

    for (const account of accounts) {
      const [state] = await db
        .select({ status: _mailSyncState.status })
        .from(_mailSyncState)
        .where(eq(_mailSyncState.accountId, account.id))
        .limit(1);
      if (state && (state.status === "delta" || state.status === "idle")) {
        await deltaJob.enqueue({ accountId: account.id });
      }
    }
  },
});
