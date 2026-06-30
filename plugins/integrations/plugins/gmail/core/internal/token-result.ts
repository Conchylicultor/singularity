/** Gmail-owned result of a token request. Deliberately NOT a re-export of auth's
 *  TokenResponse — the integration speaks its own vocabulary so consumers never
 *  import @plugins/auth. */
export type GmailTokenResult =
  | {
      ok: true;
      accessToken: string;
      expiresAt: number;
      scopes: string[];
      /** Connected Google account email (from the OAuth identity), available
       *  without a Gmail API call. `null` if the connection surfaced none. */
      email: string | null;
    }
  | { ok: false; needsConsent: boolean; message: string };
