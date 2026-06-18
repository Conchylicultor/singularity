# safe-fetch: close the DNS-rebinding TOCTOU with IP-pinned connect

## Problem

`plugins/infra/plugins/safe-fetch` resolves a hostname (`assertResolvesPublic` →
`dns.lookup`), classifies every returned address as public, then calls
`fetch(url.href)` **by hostname**. `fetch` performs its *own* second DNS
resolution. A hostile resolver (or a rebinding attack) can return a public IP to
our `lookup` and a private IP (e.g. `169.254.169.254`, `127.0.0.1`) to `fetch`'s
resolution — defeating the guard. This is a classic DNS-rebinding TOCTOU.

## Chosen approach — pin the validated IP into the connection

Resolve + validate **once**, then dial the *exact validated IP* instead of
re-resolving the hostname, while keeping SNI / `Host` / TLS-cert verification
bound to the original hostname.

Under Bun 1.3 (the server runtime — `Bun.serve`), **native `fetch` supports a
`tls.serverName` option** that overrides SNI *and* the certificate-identity
check independently of the URL host. Empirically verified:

- `fetch("https://<ip>/", { tls: { serverName: host }, headers: { host } })`
  → connects to `<ip>`, sends SNI `host`, validates the cert against `host`.
- Dialing a *mismatched* IP with `serverName: host` throws
  `ERR_TLS_CERT_ALTNAME_INVALID` — cert verification is genuinely enforced.
- A manually-set `Host` header is honored (not overwritten by the IP).

This keeps **all** of Bun fetch's semantics that consumers depend on —
automatic gzip/br decompression (the browser proxy strips `content-encoding`
and streams `res.body`; the bookmark scraper calls `res.text()`), streaming
`Response`, redirect handling — which a `node:http`/`node:https` rewrite would
have lost (Bun's `node:https` does *not* auto-decompress).

### Why not alternatives

- **undici `Agent({ connect: { lookup } })`** — undici is only a transitive
  (jsdom) dep and running it under Bun is unsupported/fragile.
- **`node:http`/`node:https` custom `lookup`** — works under Bun and pins the IP,
  but returns a `node` `IncomingMessage` with **no auto-decompression**, forcing
  a full WHATWG-`Response` + zlib reimplementation. More code, more risk, for no
  security gain over the `tls.serverName` route.

## Implementation

In `server/internal/ssrf.ts`:

1. `assertResolvesPublic(url)` → returns the **validated pinned IP** (string)
   instead of `void`. For a literal-IP host it re-checks and returns the literal;
   for a hostname it resolves, rejects if *any* record is non-public, and returns
   the first record's address. (No external caller used the old `void` return.)
2. New pure helper `buildPinnedDial(logicalUrl, ip)` → `{ href, host, serverName }`:
   - `href`: `logicalUrl` with hostname replaced by `ip` (IPv6 bracketed).
   - `host`: `logicalUrl.host` (preserves a non-default port) — sent as the
     `Host` header so vhost routing + the server's own self-view stay correct.
   - `serverName`: the bracket-stripped hostname, only for `https:` (SNI + cert).
   Unit-tested without network (v4, v6 bracketing, port preservation, http→no SNI).
3. `safeFetch` keeps a **logical** (hostname) URL for guarding and *relative
   redirect resolution*, and dials the **pinned** URL each hop:
   - guard `logicalUrl` → pin IP → `fetch(dial.href, { headers: { ...init.headers,
     host: dial.host }, tls: serverName ? { serverName } : undefined, ... })`.
   - On 3xx, resolve `Location` against `logicalUrl` (never the IP URL), re-guard,
     re-pin. Each hop is independently validated and pinned — rebinding between
     hops is also covered.

## Tradeoffs / residual notes

- **Single-IP pin (no happy-eyeballs failover).** We dial the first validated
  record; if it's down there's no automatic fallback to a sibling A/AAAA record
  (native fetch's own resolver would have tried all). All returned records were
  validated public, so any is safe; picking one trades a little availability for
  the security guarantee. Acceptable for this tool.
- **`Host`/`tls.serverName` are Bun-runtime fetch extensions.** They are the
  documented mechanism on the server runtime; not portable to a browser fetch
  (irrelevant — this is server-only).
