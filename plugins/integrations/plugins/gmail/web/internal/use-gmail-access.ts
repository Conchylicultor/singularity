import { useConfig } from "@plugins/config_v2/web";
import { useAccountStatus, missingScopes } from "@plugins/auth/web";
import { gmailConfig } from "../../shared/config";
import { GMAIL_SCOPES, GOOGLE_PROVIDER_ID } from "../../core";

/**
 * The ONE thing standing between the user and a working Gmail connection, in
 * the order it must be resolved. Consumers branch on this instead of
 * re-deriving a precedence from the three booleans — so every Gmail surface
 * offers the same next step and `GmailAccessAction` can render it.
 */
export type GmailAccessBlocker = "disabled" | "disconnected" | "scopes";

export interface GmailAccess {
  /** Settings toggle is on. */
  enabled: boolean;
  /** A Google account is connected. */
  connected: boolean;
  /** The Gmail scope has been granted on the Google connection. */
  scopesGranted: boolean;
  /** enabled && connected && scopesGranted. */
  ready: boolean;
  /** Auth status still resolving (null from useAccountStatus). */
  loading: boolean;
  /** The next unmet prerequisite, or null when ready (or still loading). */
  blocker: GmailAccessBlocker | null;
}

export function useGmailAccess(): GmailAccess {
  const { enabled } = useConfig(gmailConfig);
  const status = useAccountStatus(GOOGLE_PROVIDER_ID);
  const loading = status === null;
  const connected = status?.connected ?? false;
  const scopesGranted =
    status != null && missingScopes([...GMAIL_SCOPES], status.scopes).length === 0;
  const ready = enabled && connected && scopesGranted;

  // Precedence matters: enabling the toggle is what makes the scope requestable,
  // and a scope can only be granted on a connected account.
  let blocker: GmailAccessBlocker | null = null;
  if (!loading && !ready) {
    if (!enabled) blocker = "disabled";
    else if (!connected) blocker = "disconnected";
    else blocker = "scopes";
  }

  return { enabled, connected, scopesGranted, ready, loading, blocker };
}
