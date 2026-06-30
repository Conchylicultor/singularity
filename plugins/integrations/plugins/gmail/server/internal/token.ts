import { getTokenFromCentral } from "@plugins/auth/server";
import { GMAIL_SCOPES, type GmailTokenResult } from "../../core";

/** Obtain a Gmail-scoped Google access token via the shared auth/central
 *  secrets store. The mail app calls this instead of touching auth directly.
 *  AuthCentralOfflineError propagates (fail loudly) — only the discriminated
 *  TokenResponse is mapped into the Gmail-owned result vocabulary. */
export async function getGmailToken(): Promise<GmailTokenResult> {
  const res = await getTokenFromCentral({
    providerId: "google",
    scopes: [...GMAIL_SCOPES],
  });
  if (res.ok) {
    return {
      ok: true,
      accessToken: res.accessToken,
      expiresAt: res.expiresAt,
      scopes: res.scopes,
      email: res.identity.email ?? null,
    };
  }
  if (res.needsConsent) {
    return {
      ok: false,
      needsConsent: true,
      message: `Gmail access needs consent (${res.reason})`,
    };
  }
  return { ok: false, needsConsent: false, message: res.message };
}
