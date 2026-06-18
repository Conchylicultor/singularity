# Browser proxy — robust in-page navigation

## Problem

The in-app browser proxy (`plugins/apps/plugins/browser/plugins/proxy`) strips
framing headers and injects a small runtime shim that keeps navigation inside
the proxy by intercepting same-frame `<a>` clicks and GET-form submits and
routing them through `postMessage` to the parent (which drives the iframe).

Gaps — these escape the proxy and hit the original site's framing block (blank
frame), or desync the omnibox:

1. **JS-driven navigation** — `history.pushState/replaceState` (SPA routing),
   `window.open`, `target="_blank"` links. Not intercepted.
2. **POST form submissions** — not proxied at all; the native submit loads the
   real origin directly (un-proxied → framing block).
3. **Cross-URL server redirects** — followed server-side; the omnibox keeps
   showing the original (pre-redirect) URL.

> `location = …` / `location.assign/replace` cannot be intercepted from inside
> the page in modern browsers (non-configurable accessor/methods). Genuinely
> robust coverage of those requires full server-side URL rewriting or a service
> worker (impossible on the proxy's opaque-origin sandboxed iframe). Out of
> scope here — filed as a follow-up.

## Design

### Message protocol (proxy `core/url.ts`)

A single `postMessage` type (`singularity:browser-proxy-nav`) with a `kind`
discriminant:

- `navigate {url}` — parent-driven load (link click, GET form). Parent pushes a
  history entry and (re)loads the iframe.
- `newtab {url}` — `window.open` / `target="_blank"`. Parent opens a new browser
  tab (proxied).
- `commit {url}` — the iframe just finished loading a full document at `url`
  (fired by the shim on every document load; `url = document.baseURI` = the
  post-redirect final URL injected as `<base>`). Reflects redirects + POST
  landings. Parent reconciles (see below).
- `sync {url}` — in-page SPA URL change (`pushState`/`replaceState`/`popstate`).
  Omnibox-display only; no reload, no history entry.

### Shim additions (injected `NAV_SCRIPT`)

- Inject `<base>` **before** the `<script>` so `document.baseURI` is the real
  final URL when the shim runs.
- On run: `post(document.baseURI, "commit")`.
- Wrap `history.pushState`/`replaceState`, but **only emit `sync` for RELATIVE
  `url` args** (resolved against `<base>` = real origin). `window.location`
  inside the iframe is the *proxy* URL, so any absolute URL a site derives from
  `location` (e.g. GitHub's Turbo `replaceState(_, _, location.href)`) would leak
  the internal proxy URL into the omnibox — those are ignored. `popstate` (which
  can only read the proxy `location`) is dropped for the same reason; the omnibox
  then keeps the reliable `commit` value (`document.baseURI`).
- Override `window.open` → resolve against `baseURI`, `post(abs, "newtab")`,
  return `null`.
- `<a target="_blank">` clicks → `preventDefault` + `post(abs, "newtab")`
  (previously escaped).
- Forms: GET unchanged (serialize query → `navigate`). **POST**: rewrite
  `form.action` to the absolute proxy URL
  (`location.protocol + "//" + location.host + BROWSER_PROXY_PATH + "?url=" +
  encodeURIComponent(realAction)`) and let the native submit proceed — the POST
  now lands inside the proxy. (`location.origin` is `"null"` under the
  opaque-origin sandbox, so origin is rebuilt from `protocol`+`host`, which stay
  readable to the frame's own scripts.)

### Server (`handle-proxy.ts`, `endpoints.ts`, `server/index.ts`)

- Register `POST /api/browser/proxy` → same handler. On POST, forward the
  request method, body, and `Content-Type` to `safeFetch` (raw bytes → preserves
  url-encoded and multipart/file uploads). `safeFetch` follows redirects with
  per-hop SSRF revalidation; `res.url` is the final URL used for `<base>`.

### Parent nav store (`shell/web/nav-store.ts`)

Per-tab adds `displayUrl: string | null` (omnibox override) and
`expectCommit: boolean` (was this load parent-initiated?).

- `current` (user-facing) = `displayUrl ?? history[index] ?? ""` — drives
  omnibox, history recorder, bookmarks.
- iframe `src` = `proxyUrl(history[index])` — the request URL; unaffected by
  `commit`/`sync`, so no reload flash on redirect.
- `navigate` / `back` / `forward` / `reload`: clear `displayUrl`, set
  `expectCommit = true`, `loading = true`.
- `commit(url)`:
  - `expectCommit` (parent-driven load): set `displayUrl = url` if it differs
    from the request URL (reflects redirect), clear `expectCommit`. **No history
    change, no reload** → redirect reflection without a flash.
  - else (iframe-driven, e.g. a POST landing): push a new history entry `{url}`
    so the result is a real back/forward entry and reload re-GETs it (correct for
    the PRG pattern; a non-PRG POST reload is undefined platform-wide).
- `syncDisplay(url)`: set `displayUrl = url` only (SPA in-page nav).

### Tradeoffs

- A POST that lands via PRG (303 → GET) re-GETs once when committed (the new
  history entry's src loads). Acceptable; PRG GETs are idempotent.
- `location = …` escapes remain (browser limitation) → follow-up task.
- `window.open` returns `null` (no live handle) — sites doing `w = open();
  w.location = …` lose the handle. Rare; documented.
