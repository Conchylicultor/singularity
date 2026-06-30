/** Gmail-owned result of a token request. Deliberately NOT a re-export of auth's
 *  TokenResponse — the integration speaks its own vocabulary so consumers never
 *  import @plugins/auth. */
export type GmailTokenResult =
  | { ok: true; accessToken: string; expiresAt: number; scopes: string[] }
  | { ok: false; needsConsent: boolean; message: string };
