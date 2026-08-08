import type { Route, Request as PlaywrightRequest } from "playwright";
import { safeFetch } from "@plugins/infra/plugins/safe-fetch/server";

/**
 * Cross-origin subresources are fetched IN-PROCESS through `safeFetch` and
 * handed back to Chromium as an already-complete response. Chromium then makes
 * no request and performs no DNS lookup for them, so each one inherits the full
 * guard — literal-host rejection, per-hop DNS revalidation, IP pinning — instead
 * of relying on resolver rules that a bare IP literal walks straight past.
 *
 * The type import is `import type`, so this module does not drag Playwright's
 * ~3 s of module evaluation into anything that merely imports it.
 */

/**
 * A proxied subresource either produced bytes or failed. Failure is a value here
 * rather than a throw because a failed subresource is an ORDINARY outcome of
 * loading a page: the network is unreliable, and refusing a private target is
 * our own policy working. The page decides what a missing script means; turning
 * one blocked tracker into a failed page read would be the wrong trade.
 */
export type ProxyOutcome =
  { ok: true; bytes: number } | { ok: false; error: Error };

/**
 * Headers we must not forward upstream: `host` is owned by `safeFetch` (it
 * re-attaches the validated authority itself), and the hop-by-hop ones describe
 * the connection Chromium opened to us, not the one we open to the origin.
 */
const DROPPED_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/**
 * Headers we must not hand back to Chromium. `content-encoding` and
 * `content-length` are the load-bearing ones: `safeFetch` returns DECODED bytes,
 * so echoing `content-encoding: gzip` would make Chromium try to gunzip plain
 * bytes and discard the resource.
 */
const DROPPED_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
]);

export async function proxySubresource(
  route: Route,
  request: PlaywrightRequest,
  maxBytes: number,
): Promise<ProxyOutcome> {
  const url = request.url();
  try {
    const res = await safeFetch(url, {
      method: request.method(),
      headers: filterHeaders(request.headers(), DROPPED_REQUEST_HEADERS),
      body: request.postDataBuffer() ?? undefined,
    });

    // A declared length over the cap is refused before a byte is buffered — the
    // point of the network budget is to never hold the payload in the first place.
    const declared = Number(res.headers.get("content-length") ?? Number.NaN);
    if (Number.isFinite(declared) && declared > maxBytes) {
      await route.abort("failed");
      return {
        ok: false,
        error: new Error(
          `subresource ${url} declares ${declared} bytes, over the ${maxBytes} byte budget`,
        ),
      };
    }

    const body = Buffer.from(await res.arrayBuffer());
    if (body.byteLength > maxBytes) {
      await route.abort("failed");
      return {
        ok: false,
        error: new Error(
          `subresource ${url} returned ${body.byteLength} bytes, over the ${maxBytes} byte budget`,
        ),
      };
    }

    await route.fulfill({
      status: res.status,
      headers: filterHeaders(
        Object.fromEntries(res.headers.entries()),
        DROPPED_RESPONSE_HEADERS,
      ),
      body,
    });
    return { ok: true, bytes: body.byteLength };
  } catch (err) {
    // Every failure here — an SSRF refusal, a dead CDN, a TLS error — is
    // answered as a failed request, which is precisely what the page would have
    // observed had Chromium made the request itself. The error is RETURNED, not
    // dropped: the caller counts these and can surface them.
    const error = err instanceof Error ? err : new Error(String(err));
    await route.abort("failed");
    return { ok: false, error };
  }
}

function filterHeaders(
  headers: Record<string, string>,
  dropped: ReadonlySet<string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!dropped.has(key.toLowerCase())) out[key] = value;
  }
  return out;
}
