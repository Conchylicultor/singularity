import { useEffect, useRef } from "react";
import { useGmailAccess } from "@plugins/integrations/plugins/gmail/web";
import { mailSyncEndpoint } from "@plugins/apps/plugins/mail/plugins/sync/core";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";

/**
 * Headless app-wide listener that auto-resumes a stuck Mail sync the instant the
 * Gmail scope is (re)granted.
 *
 * The reconnect/reconsent signal only ever reaches the browser (auth runs on the
 * central runtime, which has no jobs/events to notify a worktree sync job), so
 * the clean place to react is here. `useGmailAccess().ready`
 * (`enabled && connected && scopesGranted`) flips `false → true` precisely when
 * the Gmail scope is granted — the only error class a reconnect can fix. On that
 * edge we POST the existing kick endpoint (`mailSyncEndpoint`); its handler runs
 * `ensureAccount()` + `kickSync()`, which clears the error and re-arms the delta.
 *
 * Edge-guarded via a ref so it fires only on the transition, never on mount or on
 * mail-state churn; a failed kick re-errors the account without touching `ready`,
 * so it never re-fires, and a later scope revocation (`ready → false`) re-arms it.
 *
 * The auth status resolves asynchronously, so `useGmailAccess` reports
 * `loading` (with `ready === false`) on first render before settling. We ignore
 * that unresolved phase and seed the baseline from the first *resolved* value —
 * otherwise the initial `loading → ready` settle would masquerade as a reconnect
 * and fire on every page load.
 */
export function GmailReconnectResume(): null {
  const { ready, loading } = useGmailAccess();
  const resume = useEndpointMutation(mailSyncEndpoint);
  // null = not yet resolved (no baseline captured).
  const prevReady = useRef<boolean | null>(null);

  useEffect(() => {
    if (loading) return;
    const prev = prevReady.current;
    prevReady.current = ready;
    // First resolved observation is the baseline — don't fire on it.
    if (prev === null) return;
    if (ready && !prev) resume.mutate({});
  }, [ready, loading, resume]);

  return null;
}
