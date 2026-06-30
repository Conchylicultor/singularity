import {
  deriveMailSyncView,
  mailSyncStateResource,
  type MailSyncView,
} from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { useResource } from "@plugins/primitives/plugins/live-state/web";

/**
 * The single, user-facing mail-sync view for the banner. Subscribes to the live
 * `mail_sync_state` rows and folds them through the shared pure aggregator so
 * the displayed phase can never drift from the recorded state. `view` is `null`
 * until the resource has settled (the banner renders nothing while pending).
 */
export function useMailSyncState(): { pending: boolean; view: MailSyncView | null } {
  const result = useResource(mailSyncStateResource);
  if (result.pending) return { pending: true, view: null };
  return { pending: false, view: deriveMailSyncView(result.data) };
}
