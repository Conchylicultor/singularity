import type { MailSyncStatus } from "@plugins/apps/plugins/mail/plugins/mail-core/core";

/** One account as the tick sees it: its sync-state status, or `null` when it has no row. */
export interface TickAccount {
  readonly id: string;
  readonly status: MailSyncStatus | null;
}

/** What one scheduled tick does. */
export interface TickPlan {
  /**
   * Run `ensureAccount()` once. True on first connect (no account yet) AND when
   * an account has no `mail_sync_state` row.
   *
   * The second case is what a restore from backup produces: `mail_sync_state`
   * is left out of backups together with the Gmail corpus it watermarks, while
   * `mail_accounts` is kept. Without this, the tick skips such an account
   * forever and the mailbox stays empty with no error on screen. Bootstrap
   * finds the account again from the OAuth email, arms a fresh watermark and
   * queues the backfill.
   */
  readonly bootstrap: boolean;
  /** Accounts in a pull-ready state, each getting a delta enqueued. */
  readonly delta: readonly string[];
}

/**
 * Pure: decide the tick from the accounts and their sync status. Backfilling
 * accounts self-continue via their own chain; errored accounts are left alone
 * until the user acts.
 */
export function planSyncTick(accounts: readonly TickAccount[]): TickPlan {
  return {
    bootstrap: accounts.length === 0 || accounts.some((a) => a.status === null),
    delta: accounts
      .filter((a) => a.status === "delta" || a.status === "idle")
      .map((a) => a.id),
  };
}
