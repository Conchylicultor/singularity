import {
  defineAuthProvider,
  type AuthIdentity,
  type AuthProviderDescriptor,
} from "@plugins/auth/core";
import { GOOGLE_MAPS_PROVIDER_ID } from "../../core";

/**
 * Cheapest call in the Places API surface, used purely as a liveness probe:
 * it exercises the same host, the same key header and the same per-project
 * enablement + billing checks a real lookup does.
 */
const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";

/**
 * Google returns `{"error":{"code":…,"message":…,"status":…}}` for a rejected
 * key. Surface its own wording — "API not enabled", "billing not enabled",
 * REQUEST_DENIED — verbatim, because that text is the whole diagnosis. A body
 * that is not JSON is passed through as-is rather than discarded.
 */
function googleErrorText(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string; status?: string };
    };
    const message = parsed.error?.message;
    const status = parsed.error?.status;
    if (message) return status ? `${status}: ${message}` : message;
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
  }
  return raw.slice(0, 500);
}

/**
 * The wizard's Test step. `actions.setApiKey` stores a stub identity when a
 * descriptor has no `verify`, which would make any string read as Connected —
 * so this probe is what makes "Connected" mean something for this provider.
 */
async function verifyMapsKey(apiKey: string): Promise<AuthIdentity> {
  const res = await fetch(AUTOCOMPLETE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify({ input: "coffee" }),
  }).catch((err: unknown) => {
    // Distinguish "this machine could not reach Google" from "Google said no":
    // both arrive in the wizard as a 400, and only one of them is about the key.
    throw new Error(
      `Could not reach Google to verify the key — check this machine's internet connection. (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
  });
  if (!res.ok) {
    throw new Error(
      `Google rejected this key (HTTP ${res.status}). ${googleErrorText(
        await res.text(),
      )}`,
    );
  }
  return { accountId: "primary", displayName: "Google Maps Platform" };
}

export const googleMapsDescriptor: AuthProviderDescriptor = defineAuthProvider({
  id: GOOGLE_MAPS_PROVIDER_ID,
  name: "Google Maps Platform",
  kind: "apikey",
  apiKey: {
    // Every Google API key is `AIza` + 35 URL-safe characters. Catches a
    // truncated or mis-pasted key before any network call.
    pattern: /^AIza[0-9A-Za-z_-]{35}$/,
    help: "Create an API key in Google Cloud Console → APIs & Services → Credentials, with the Places API enabled and billing linked.",
    verify: verifyMapsKey,
  },
});
