import type { MailSyncErrorCode } from "./enums";
import type { MailSyncState } from "./types";

// Pure, web+server-safe derivation of a single user-facing sync status from the
// raw per-account `mail_sync_state` rows. Both the UI (badge/banner) and any
// server consumer read the same `deriveMailSyncView`, so the displayed phase can
// never drift from the recorded state.

/** The user-facing health of the mail sync engine, aggregated across accounts. */
export type MailSyncPhase =
  | "idle"
  | "syncing"
  | "healthy"
  | "warning"
  | "error";

export interface MailSyncView {
  phase: MailSyncPhase;
  lastSyncedAt: string | null;
  error?: {
    code: MailSyncErrorCode;
    message: string;
    terminal: boolean;
  };
}

const FALLBACK_ERROR_MESSAGE = "Something went wrong while syncing your mailbox.";

// Worst-phase-wins ordering: a single errored account dominates the aggregate.
const PHASE_RANK: Record<MailSyncPhase, number> = {
  error: 4,
  warning: 3,
  syncing: 2,
  healthy: 1,
  idle: 0,
};

/** Per-row phase + (when unhealthy) the row's classified error. */
function deriveRowView(row: MailSyncState): MailSyncView {
  const lastSyncedAt = maxIso(row.lastDeltaSyncAt, row.lastFullSyncAt);

  if (row.status === "error") {
    return {
      phase: "error",
      lastSyncedAt,
      error: {
        code: row.errorCode ?? "unknown",
        message: row.lastError ?? FALLBACK_ERROR_MESSAGE,
        terminal: true,
      },
    };
  }

  if (row.status === "backfilling") {
    return { phase: "syncing", lastSyncedAt };
  }

  // "delta" | "idle": a recorded error newer than the last successful delta is a
  // non-terminal warning (the engine keeps retrying); otherwise healthy/idle.
  const hasFreshError =
    row.lastErrorAt != null &&
    (row.lastDeltaSyncAt == null ||
      new Date(row.lastErrorAt) > new Date(row.lastDeltaSyncAt));
  if (hasFreshError) {
    return {
      phase: "warning",
      lastSyncedAt,
      error: {
        code: row.errorCode ?? "unknown",
        message: row.lastError ?? FALLBACK_ERROR_MESSAGE,
        terminal: false,
      },
    };
  }

  if (row.lastDeltaSyncAt != null || row.lastFullSyncAt != null) {
    return { phase: "healthy", lastSyncedAt };
  }
  return { phase: "idle", lastSyncedAt };
}

/** Aggregate the per-account rows into one user-facing view (worst phase wins). */
export function deriveMailSyncView(rows: MailSyncState[]): MailSyncView {
  let winner: MailSyncView | null = null;
  let lastSyncedAt: string | null = null;
  for (const row of rows) {
    const view = deriveRowView(row);
    if (winner == null || PHASE_RANK[view.phase] > PHASE_RANK[winner.phase]) {
      winner = view;
    }
    lastSyncedAt = maxIso(lastSyncedAt, view.lastSyncedAt);
  }
  if (winner == null) return { phase: "idle", lastSyncedAt: null };
  return { phase: winner.phase, lastSyncedAt, error: winner.error };
}

/** Max of two nullable ISO/Date timestamps, returned as an ISO string. */
function maxIso(
  a: Date | string | null,
  b: Date | string | null,
): string | null {
  const ta = a == null ? null : new Date(a);
  const tb = b == null ? null : new Date(b);
  if (ta == null) return tb == null ? null : tb.toISOString();
  if (tb == null) return ta.toISOString();
  return (ta > tb ? ta : tb).toISOString();
}

/** Remediation copy + the action the UI should offer, keyed by error code. */
export const MAIL_SYNC_REMEDIATION: Record<
  MailSyncErrorCode,
  {
    title: string;
    body: string;
    action: "reconnect" | "enable-api" | "none";
    learnMoreUrl?: string;
  }
> = {
  auth: {
    title: "Gmail sign-in needed",
    body: "Reconnect your Google account to resume syncing.",
    action: "reconnect",
  },
  api_disabled: {
    title: "Gmail API not enabled",
    body: "Enable the Gmail API for your Google Cloud project, then retry.",
    action: "enable-api",
    learnMoreUrl:
      "https://console.cloud.google.com/apis/library/gmail.googleapis.com",
  },
  quota: {
    title: "Gmail rate limit reached",
    body: "Syncing paused briefly — it will retry automatically.",
    action: "none",
  },
  unknown: {
    title: "Sync problem",
    body: "Something went wrong while syncing your mailbox.",
    action: "none",
  },
  resync_loop: {
    title: "Mailbox sync stuck",
    body: "Your mailbox is being re-synced repeatedly without catching up — it may be too large to back up before Gmail's sync window expires. Retrying may help; otherwise try again later.",
    action: "none",
  },
};
