import { getGmailToken } from "@plugins/integrations/plugins/gmail/server";

/** Resolve a usable Gmail access token or fail loudly. The mail data layer's
 *  single entry point for Gmail auth — it goes through the gmail integration,
 *  never @plugins/auth directly. */
export async function requireGmailToken(): Promise<string> {
  const result = await getGmailToken();
  if (!result.ok) throw new Error(`Gmail token unavailable: ${result.message}`);
  return result.accessToken;
}
