import { createHash } from "node:crypto";
import { normalizeHost } from "../../core";

/**
 * The primary language subtag of an `Accept-Language` header (`fr-CH, fr;q=0.9`
 * → `fr`), or null when absent or not a language tag. Only the first entry:
 * it is the browser's own preference order.
 */
export function primaryLanguage(header: string | null): string | null {
  if (header === null) return null;
  const first = header.split(",")[0]?.split(";")[0]?.trim() ?? "";
  const primary = first.split("-")[0]?.toLowerCase() ?? "";
  return /^[a-z]{2,3}$/.test(primary) ? primary : null;
}

/**
 * The daily visitor hash. The IP and user agent go in and are never stored;
 * the salt is deleted after its day, so the hash cannot be recomputed later.
 */
export function visitorHash(parts: {
  salt: string;
  ip: string;
  userAgent: string;
  host: string;
}): string {
  return createHash("sha256")
    .update([parts.salt, parts.ip, parts.userAgent, parts.host].join("\n"))
    .digest("hex");
}

/** Where a visit came from, as stored: host and path, never the query string. */
export interface ParsedReferrer {
  host: string;
  path: string;
}

/**
 * The referrer's host (normalised) and path. A self-referral — the site linking
 * to itself, e.g. after a reload — is no referrer at all. A value that is not an
 * absolute URL is dropped: `document.referrer` is either one or empty.
 */
export function parseReferrer(
  referrer: string | undefined,
  siteHost: string,
): ParsedReferrer | null {
  if (!referrer) return null;
  if (!URL.canParse(referrer)) return null;
  const url = new URL(referrer);
  if (!url.hostname) return null;
  const host = normalizeHost(url.hostname);
  if (host === normalizeHost(siteHost.replace(/:\d+$/, ""))) return null;
  return { host, path: url.pathname || "/" };
}
