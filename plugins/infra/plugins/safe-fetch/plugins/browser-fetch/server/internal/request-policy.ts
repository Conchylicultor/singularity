import {
  SsrfError,
  parsePublicUrl,
} from "@plugins/infra/plugins/safe-fetch/server";

/**
 * What to do with one intercepted request. Pure and synchronous, so the whole
 * policy is unit-testable without a browser — which matters more here than
 * anywhere else in the plugin, because the orchestrator itself cannot be tested
 * against a local fixture server (it correctly refuses `localhost`).
 */
export type RequestDecision =
  | { kind: "block"; reason: string }
  /** Let Chromium make the request itself — the real TLS fingerprint. */
  | { kind: "continue" }
  /** Fetch it in-process through `safeFetch` and fulfill from the bytes. */
  | { kind: "proxy" }
  /** The main frame is being sent to another host; the caller must relaunch. */
  | { kind: "cross-host-navigation"; url: string };

export interface RequestFacts {
  url: string;
  /** Playwright's resource type (`document`, `script`, `image`, …). */
  resourceType: string;
  /** True only for a MAIN-frame navigation. */
  isMainFrameNavigation: boolean;
  /** The hostname this browser's resolver rules pin. */
  pinnedHost: string;
}

/**
 * Resource types blocked purely for SPEED — they cannot carry text the caller
 * wants. Verified: blocking the image CDN still rendered the full 338 KB
 * shotgun.live page. `stylesheet` is deliberately NOT here: some frameworks gate
 * first paint on it, and a page that never paints is a page with no content.
 */
const SKIPPED_RESOURCE_TYPES = new Set(["image", "media", "font"]);

/** Schemes that reach no network and are safe to let through untouched. */
const INERT_SCHEMES = new Set(["data:", "blob:", "about:"]);

/**
 * The request policy, evaluated in exactly this order.
 *
 * Step 3 — running `parsePublicUrl` on EVERY remaining request — is the single
 * most important line in this plugin, and it is **not** redundant with the
 * resolver rules. A request to a bare IP literal
 * (`http://169.254.169.254/latest/meta-data/`) performs no DNS lookup at all, so
 * both `MAP` rules are inert against it. Trusting the resolver alone would leave
 * a live cloud-metadata hole inside a browser that is running hostile JS.
 */
export function decideRequest(facts: RequestFacts): RequestDecision {
  // 1. Cosmetic subresources — never fetched, never proxied.
  if (SKIPPED_RESOURCE_TYPES.has(facts.resourceType)) {
    return { kind: "block", reason: `resource type ${facts.resourceType}` };
  }

  // 2. Inert schemes carry their own bytes; anything else non-http(s)
  //    (`file:`, `chrome:`, `ws:`) is refused outright.
  const scheme = schemeOf(facts.url);
  if (scheme !== null && INERT_SCHEMES.has(scheme)) {
    return { kind: "continue" };
  }

  // 3. The SSRF guard, on every request, including bare IP literals.
  let parsed: URL;
  try {
    parsed = parsePublicUrl(facts.url);
  } catch (err) {
    if (!(err instanceof SsrfError)) throw err;
    return { kind: "block", reason: err.message };
  }

  const host = parsed.hostname.toLowerCase();
  const pinned = facts.pinnedHost.toLowerCase();

  // 4. The main frame leaving the pinned host. The pin is a launch arg, so this
  //    cannot be followed in-browser — it is reported up so the caller can
  //    revalidate the new host and relaunch pinned to it.
  if (facts.isMainFrameNavigation && host !== pinned) {
    return { kind: "cross-host-navigation", url: parsed.href };
  }

  // 5. The pinned host answers for itself. This MUST stay a real Chromium
  //    request — that genuine TLS fingerprint is the entire point of the plugin.
  if (host === pinned) return { kind: "continue" };

  // 6. Everything else is a cross-origin subresource: fetched in-process through
  //    `safeFetch` and fulfilled from the bytes, so Chromium makes no request and
  //    performs no lookup and the subresource inherits ALL of `safeFetch`'s
  //    guarantees. Blocking these outright would be simpler and would break every
  //    SPA whose bundle lives on a third-party CDN — and it would break it as a
  //    silently EMPTY page, the exact failure shape a caller cannot distinguish
  //    from "this site has nothing on it".
  return { kind: "proxy" };
}

function schemeOf(url: string): string | null {
  const colon = url.indexOf(":");
  if (colon <= 0) return null;
  return url.slice(0, colon + 1).toLowerCase();
}
