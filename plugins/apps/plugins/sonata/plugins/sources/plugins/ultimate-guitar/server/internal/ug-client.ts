import crypto from "node:crypto";
import { z } from "zod";
import { safeFetch, SsrfError } from "@plugins/infra/plugins/safe-fetch/server";
import { extractUgTabId, UgFetchError } from "../../core";
import type { UgTab } from "../../core";

/**
 * Ultimate Guitar mobile-API client.
 *
 * ⚠️ FRAGILE BY DESIGN. UG has no public API; this targets the undocumented
 * Android mobile API with app-version + per-request signing headers that UG can
 * rotate at any time. There is no fallback (mobile-API-only). Every breakage
 * surfaces as a loud `UgFetchError` — never a silent failure.
 *
 * Confirmed signing scheme (verified empirically against tab 3250376):
 *   deviceId = first 16 chars of a random 16-byte hex string
 *   apiKey   = md5( deviceId + "<UTC yyyy-mm-dd>:<UTC hour int, no leading 0>createLog()" )
 * If UG returns 498 ("Token expired/invalid"), the signing scheme rotated and
 * the headers below need updating.
 */

const UG_API_BASE = "https://api.ultimate-guitar.com/api/v1/tab/info";
const UG_USER_AGENT = "UGT_ANDROID/4.11.1 (Pixel; 8.1.0)";
const FETCH_TIMEOUT_MS = 15_000;

/** Tolerant view of the flat UG mobile-API response — only the fields we map. */
const UgApiResponseSchema = z.object({
  id: z.number(),
  song_name: z.string(),
  artist_name: z.string(),
  content: z.string(),
  type: z.string().optional(),
  tonality_name: z.string().optional(),
  capo: z.number().optional(),
  tuning: z.string().optional(),
  urlWeb: z.string().optional(),
});

/** Generate a fresh, stateless device id + signing key pair for this request. */
function buildAuthHeaders(): { deviceId: string; apiKey: string } {
  const deviceId = crypto.randomBytes(16).toString("hex").slice(0, 16);
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  // Hour is an integer with NO leading zero. Salt literal is exactly `createLog()`.
  const payload = `${deviceId}${yyyy}-${mm}-${dd}:${now.getUTCHours()}createLog()`;
  const apiKey = crypto.createHash("md5").update(payload).digest("hex");
  return { deviceId, apiKey };
}

/**
 * Resolve a pasted UG tab URL to a `UgTab`. Fails loudly: every distinct
 * breakage becomes a classified `UgFetchError`. NO persistence, NO markup
 * parsing — `content` is carried verbatim.
 */
export async function fetchUgTabContent(url: string): Promise<UgTab> {
  const tabId = extractUgTabId(url); // throws UgFetchError{kind:"invalid-url"}

  const { deviceId, apiKey } = buildAuthHeaders();
  const apiUrl = `${UG_API_BASE}?tab_id=${tabId}&tab_access_type=private`;

  let res: Response;
  try {
    res = await safeFetch(apiUrl, {
      headers: {
        "User-Agent": UG_USER_AGENT,
        Accept: "application/json",
        "Accept-Charset": "utf-8",
        "X-UG-CLIENT-ID": deviceId,
        "X-UG-API-KEY": apiKey,
      },
      timeoutMs: FETCH_TIMEOUT_MS,
    });
  } catch (err) {
    // Expected wrappable set: SSRF block, transport/DNS failure (TypeError),
    // and timeout/abort. Anything else is truly unexpected → rethrow loudly.
    if (
      err instanceof SsrfError ||
      err instanceof TypeError ||
      (err instanceof Error && err.name === "AbortError")
    ) {
      throw new UgFetchError(
        "network",
        `Network error fetching Ultimate Guitar tab ${tabId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        { cause: err },
      );
    }
    throw err;
  }

  if (!res.ok) {
    switch (res.status) {
      case 404:
        throw new UgFetchError(
          "not-found",
          `Ultimate Guitar tab ${tabId} not found (404).`,
        );
      case 400:
        throw new UgFetchError(
          "bad-request",
          `Ultimate Guitar rejected the request (400 Bad Request) for tab ${tabId} — the required mobile-API headers/params may have changed.`,
        );
      case 498:
        throw new UgFetchError(
          "signature-rejected",
          `Ultimate Guitar rejected the request signature (498) for tab ${tabId} — the mobile-API signing scheme has likely rotated; update the signing headers in ug-client.ts.`,
        );
      default:
        throw new UgFetchError(
          "upstream",
          `Ultimate Guitar returned an unexpected status ${res.status} for tab ${tabId}.`,
        );
    }
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new UgFetchError(
      "malformed-response",
      `Ultimate Guitar returned a non-JSON body for tab ${tabId} — the mobile-API response shape may have changed.`,
      { cause: err },
    );
  }

  const parsed = UgApiResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new UgFetchError(
      "malformed-response",
      `Ultimate Guitar response for tab ${tabId} failed validation — the mobile-API response shape may have changed: ${parsed.error.message}`,
      { cause: parsed.error },
    );
  }

  const data = parsed.data;
  const key = data.tonality_name && data.tonality_name.trim() ? data.tonality_name : null;

  return {
    tabId: String(data.id),
    songName: data.song_name,
    artistName: data.artist_name,
    type: data.type ?? "",
    key,
    capo: data.capo ?? 0,
    tuning: data.tuning ?? "",
    content: data.content,
    urlWeb: data.urlWeb ?? "",
  };
}
