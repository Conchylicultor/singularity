import { useConfig } from "@plugins/config_v2/web";
import { useAccountStatus } from "@plugins/auth/web";
import { gmailConfig } from "../../shared/config";
import { GMAIL_SCOPES } from "../../core";

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
}

export function useGmailAccess(): GmailAccess {
  const { enabled } = useConfig(gmailConfig);
  const status = useAccountStatus("google");
  const loading = status === null;
  const connected = status?.connected ?? false;
  const granted = new Set(status?.scopes ?? []);
  const scopesGranted =
    status != null && GMAIL_SCOPES.every((scope) => granted.has(scope));
  return {
    enabled,
    connected,
    scopesGranted,
    ready: enabled && connected && scopesGranted,
    loading,
  };
}
