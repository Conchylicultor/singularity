import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

/**
 * The framing-stripping browser proxy. This is a **raw** handler (registered via
 * `[browserProxyEndpoint.route]` but NOT wrapped with `implement()`): it streams
 * the upstream response with framing headers stripped and the HTML rewritten, so
 * it has no response codec. The route MUST equal `BROWSER_PROXY_PATH`
 * (`proxy/core`).
 */
export const browserProxyEndpoint = defineEndpoint({
  route: "GET /api/browser/proxy",
  query: z.object({ url: z.string() }),
});

/**
 * POST variant of the browser proxy — same route, same raw `handleProxy`
 * handler. Forms inside the proxied page rewrite their `action` to this route so
 * a POST submit lands inside the proxy (forwarded method + body + Content-Type)
 * instead of escaping to the real origin and hitting its framing block. No body
 * schema: it's a raw streaming handler, not wrapped with `implement()`.
 */
export const browserProxyPostEndpoint = defineEndpoint({
  route: "POST /api/browser/proxy",
});
