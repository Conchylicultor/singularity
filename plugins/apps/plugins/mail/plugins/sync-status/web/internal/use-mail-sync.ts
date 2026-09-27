import {
  deriveMailSyncView,
  mailSyncState,
  type MailSyncView,
} from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { useLive } from "@plugins/network/plugins/live/web";

/** The mail-sync view once the live rows have settled; `pending` until then. */
export type MailSyncReading =
  { pending: true } | { pending: false; view: MailSyncView };

/**
 * The single, user-facing mail-sync view for the banner and the rail dot.
 * Subscribes to the live `mail_sync_state` rows and folds them through the
 * shared pure aggregator so the displayed phase can never drift from the
 * recorded state. A discriminated union, so a consumer cannot read a view
 * before one exists (both render nothing while pending).
 */
export function useMailSyncState(): MailSyncReading {
  const result = useLive(mailSyncState);
  if (result.pending) return { pending: true };
  return { pending: false, view: deriveMailSyncView(result.data) };
}
