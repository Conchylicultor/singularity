// Closed-list constants + types for the mail domain. Plain data in `core/` (per
// the project's "closed list → plain data, not a slot" guidance): both runtimes
// need these, and the sets are fully enumerable today.

/** Label provenance: Gmail system labels (INBOX, SENT, …) vs user-created. */
export const MAIL_LABEL_TYPES = ["system", "user"] as const;
export type MailLabelType = (typeof MAIL_LABEL_TYPES)[number];

/** The kinds of pending mutation the outbox replays against Gmail. */
export const MAIL_OUTBOX_OP_TYPES = [
  "send",
  "modifyLabels",
  "trash",
  "delete",
  "markRead",
  "markUnread",
  "star",
  "unstar",
] as const;
export type MailOutboxOpType = (typeof MAIL_OUTBOX_OP_TYPES)[number];

/** Lifecycle of a single outbox item. */
export const MAIL_OUTBOX_STATUSES = [
  "pending",
  "inflight",
  "done",
  "failed",
] as const;
export type MailOutboxStatus = (typeof MAIL_OUTBOX_STATUSES)[number];

/** Per-account sync engine state. */
export const MAIL_SYNC_STATUSES = [
  "idle",
  "backfilling",
  "delta",
  "error",
] as const;
export type MailSyncStatus = (typeof MAIL_SYNC_STATUSES)[number];

/** Classification of a sync failure, driving the remediation copy + action. */
export const MAIL_SYNC_ERROR_CODES = [
  "auth",
  "api_disabled",
  "quota",
  "unknown",
  "resync_loop",
] as const;
export type MailSyncErrorCode = (typeof MAIL_SYNC_ERROR_CODES)[number];

/**
 * Max consecutive stale-historyId (404) resyncs before the delta job stops
 * re-backfilling and escalates to a terminal `resync_loop` error. Guards against
 * an endless backfilling→delta→404 loop when the mailbox can't be backfilled
 * before Gmail's history window expires. Reset to 0 on any successful delta pass.
 */
export const MAX_CONSECUTIVE_RESYNCS = 3;
