import { getTokenFromCentral } from "@plugins/auth/server";
import { GOOGLE_MAPS_PROVIDER_ID } from "@plugins/auth/plugins/google-maps/core";

/**
 * The Google Maps Platform API key, or the ONE reason there isn't one.
 *
 * A discriminated result, never `""` — an empty key is indistinguishable from a
 * real one at the call site and would surface as a confusing REQUEST_DENIED from
 * Google instead of "you haven't set this up yet".
 */
export type MapsKeyResult =
  { ok: true; key: string } | { ok: false; reason: "not-configured" };

/**
 * Read the Maps API key from the shared auth/central secrets store. Consumers
 * call this instead of touching `@plugins/auth` — this integration owns the
 * Google Maps vocabulary on their behalf.
 *
 * The provider is `kind: "apikey"`, so central's token response carries the raw
 * key as `accessToken` with `expiresAt: Number.MAX_SAFE_INTEGER`. No `scopes`
 * argument is passed: they are silently ignored for api-key accounts, so asking
 * for them would only imply a guarantee that isn't there.
 *
 * Failure modes, all loud:
 * - no key stored yet          → `{ ok: false, reason: "not-configured" }`
 * - central unreachable        → `AuthCentralOfflineError` propagates
 * - anything else from central → throws with central's own message
 */
export async function getMapsKey(): Promise<MapsKeyResult> {
  const res = await getTokenFromCentral({
    providerId: GOOGLE_MAPS_PROVIDER_ID,
  });
  if (res.ok) return { ok: true, key: res.accessToken };
  if (res.needsConsent) return { ok: false, reason: "not-configured" };
  throw new Error(`Google Maps key unavailable: ${res.message}`);
}
