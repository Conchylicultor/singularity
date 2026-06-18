/**
 * SSRF-guarded fetch primitive. Both the in-app browser proxy and the bookmark
 * scraper need to fetch arbitrary user-supplied URLs without letting a crafted
 * (or redirecting) target reach loopback / private-network / cloud-metadata
 * services. This module centralizes IP classification, URL parsing, DNS
 * resolution checks, and a redirect-following fetch that re-guards every hop.
 *
 * Residual risk — DNS-rebinding TOCTOU: `assertResolvesPublic` resolves the
 * hostname and classifies the returned addresses, but `safeFetch` then fetches
 * by hostname, so a hostile resolver could return a public IP to our `lookup`
 * and a private IP to the real connection. Closing this requires pinning the
 * resolved IP into the connection (custom dispatcher / IP-pinned connect) —
 * tracked as a follow-up. Acceptable for a single-user localhost dev tool.
 */
import { lookup } from "node:dns/promises";

/** Thrown when a URL is disallowed (bad scheme, or resolves to a non-public IP). */
export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_REDIRECTS = 8;

export interface SafeFetchInit {
  headers?: Record<string, string>;
  /** HTTP method (default GET). */
  method?: string;
  /** Request body for non-GET methods (raw bytes / stream). */
  body?: BodyInit;
  timeoutMs?: number;
  maxRedirects?: number;
  signal?: AbortSignal;
}

/** Parse "a.b.c.d" into four octets, or null if not a valid dotted-quad IPv4. */
function parseIpv4(ip: string): [number, number, number, number] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets as [number, number, number, number];
}

/** Classify a dotted-quad IPv4 as private / loopback / link-local / reserved. */
function isPrivateIpv4(ip: string): boolean {
  const octets = parseIpv4(ip);
  if (!octets) return false;
  const [a, b] = octets;

  // 0.0.0.0/8 — "this network" / unspecified.
  if (a === 0) return true;
  // 10.0.0.0/8 — private.
  if (a === 10) return true;
  // 127.0.0.0/8 — loopback.
  if (a === 127) return true;
  // 169.254.0.0/16 — link-local (incl. 169.254.169.254 cloud metadata).
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 — private.
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 — private.
  if (a === 192 && b === 168) return true;
  // 100.64.0.0/10 — carrier-grade NAT.
  if (a === 100 && b >= 64 && b <= 127) return true;

  return false;
}

/**
 * Classify an IPv4 OR IPv6 literal as non-public (loopback / private /
 * link-local / reserved / metadata). Conservative: anything we can't confirm is
 * public-routable returns true. IPv4-mapped IPv6 (`::ffff:1.2.3.4`) is unwrapped
 * and classified as the embedded IPv4.
 */
export function isPrivateIp(ip: string): boolean {
  const raw = ip.trim().toLowerCase();
  if (raw === "") return true;

  // Plain IPv4.
  if (parseIpv4(raw)) return isPrivateIpv4(raw);

  // Everything below is treated as IPv6. Strip a possible zone id (fe80::1%eth0).
  const addr = raw.split("%")[0] ?? raw;

  // Unspecified address (::).
  if (addr === "::" || addr === "0:0:0:0:0:0:0:0") return true;
  // Loopback (::1).
  if (addr === "::1" || addr === "0:0:0:0:0:0:0:1") return true;

  // IPv4-mapped (::ffff:1.2.3.4) and IPv4-compatible (::1.2.3.4) — unwrap the
  // trailing dotted-quad and classify it as IPv4.
  const mapped = /^::(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(addr);
  if (mapped) {
    const v4 = mapped[1];
    return v4 ? isPrivateIpv4(v4) : true;
  }

  // Unique-local addresses fc00::/7 — first byte 1111110x → fc / fd prefix.
  if (addr.startsWith("fc") || addr.startsWith("fd")) return true;
  // Link-local fe80::/10 — high 10 bits 1111111010 → fe8/fe9/fea/feb prefix.
  if (
    addr.startsWith("fe8") ||
    addr.startsWith("fe9") ||
    addr.startsWith("fea") ||
    addr.startsWith("feb")
  ) {
    return true;
  }

  // A bare hostname (no colon) is not an IP literal — let the resolver classify.
  if (!addr.includes(":")) return false;

  // Any other syntactically-IPv6 address: treat as public. (Global-unicast
  // 2000::/3 etc.)
  return false;
}

/**
 * Synchronous parse + cheap literal guard. Parses `raw` with `new URL`
 * (rejecting unparseable input), requires an http(s) scheme, and fast-rejects
 * literal private/loopback/link-local hosts by pattern (no DNS). Use
 * {@link assertResolvesPublic} afterwards for the DNS-resolution check.
 */
export function parsePublicUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch (err) {
    // `new URL` throws TypeError on unparseable input — surface as SsrfError.
    // Any other (unexpected) error propagates.
    if (!(err instanceof TypeError)) throw err;
    throw new SsrfError(`Invalid URL: ${raw}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfError(`Only http(s) URLs are supported: ${parsed.protocol}`);
  }

  // Strip IPv6 brackets so the literal classifier sees a bare address.
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // `localhost` and any `.localhost` subdomain resolve to loopback by spec.
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new SsrfError(`URL host is not allowed: ${host}`);
  }

  // Fast literal-IP reject (DNS hostnames are checked later by lookup).
  if (isPrivateIp(host)) {
    throw new SsrfError(`URL host is not allowed: ${host}`);
  }

  return parsed;
}

/**
 * DNS-resolve the URL's hostname and reject if ANY resolved address is
 * non-public (a hostname can have multiple A/AAAA records; one private record is
 * enough to abuse). If the host is already an IP literal, classify it directly
 * without a lookup. Throws {@link SsrfError} on rejection.
 */
export async function assertResolvesPublic(url: URL): Promise<void> {
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // Literal IP — already classified by parsePublicUrl, but re-check defensively.
  if (parseIpv4(host) || host.includes(":")) {
    if (isPrivateIp(host)) {
      throw new SsrfError(`URL host is not allowed: ${host}`);
    }
    return;
  }

  const records = await lookup(host, { all: true });
  if (records.length === 0) {
    throw new SsrfError(`URL host did not resolve: ${host}`);
  }
  for (const { address } of records) {
    if (isPrivateIp(address)) {
      throw new SsrfError(
        `URL host resolves to a non-public address: ${host} -> ${address}`,
      );
    }
  }
}

/**
 * SSRF-guarded fetch. Parses + guards the target, then fetches with
 * `redirect: "manual"`, re-running {@link parsePublicUrl} + DNS revalidation on
 * every redirect hop (a public URL could otherwise 30x-redirect to a private
 * host, defeating the initial guard). Returns the final non-3xx Response.
 *
 * - `timeoutMs` (default 20s) bounds the whole request via `AbortSignal.timeout`.
 * - `signal` is honored in addition to the timeout (whichever fires first).
 * - Throws {@link SsrfError} on a blocked target/redirect, or a plain Error on
 *   too many redirects.
 */
export async function safeFetch(
  target: string | URL,
  init: SafeFetchInit = {},
): Promise<Response> {
  const maxRedirects = init.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let url = parsePublicUrl(typeof target === "string" ? target : target.href);
  await assertResolvesPublic(url);

  // Method + body are mutated across hops: a 301/302/303 downgrades the request
  // to a bodyless GET (standard browser behavior for the POST→GET redirect of
  // the PRG pattern), while 307/308 preserve the original method + body.
  let method = init.method ?? "GET";
  let body = init.body;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const signal = mergeSignals(AbortSignal.timeout(timeoutMs), init.signal);
    const res = await fetch(url.href, {
      method,
      body,
      redirect: "manual",
      signal,
      headers: init.headers,
    });

    if (res.status < 300 || res.status >= 400) return res;

    const loc = res.headers.get("location");
    if (!loc) return res; // 3xx without Location — nothing to follow.

    // 301/302/303: downgrade to GET and drop the body (PRG); 307/308 preserve.
    if (res.status !== 307 && res.status !== 308) {
      method = "GET";
      body = undefined;
    }

    // Resolve relative Location against the current URL, then re-guard the hop.
    url = parsePublicUrl(new URL(loc, url).href);
    await assertResolvesPublic(url);
  }

  throw new Error(`Too many redirects (>${maxRedirects})`);
}

/** Combine the timeout signal with an optional caller signal (first to abort wins). */
function mergeSignals(
  timeout: AbortSignal,
  extra: AbortSignal | undefined,
): AbortSignal {
  if (!extra) return timeout;
  return AbortSignal.any([timeout, extra]);
}
