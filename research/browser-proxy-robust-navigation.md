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
4. **Declarative refresh redirects** — `<meta http-equiv="refresh" url=…>` and
   the HTTP `Refresh` response header. Now handled (see below).

> `location = …` / `location.assign/replace` cannot be intercepted from inside
> the page in modern browsers (non-configurable accessor/methods). Genuinely
> robust coverage of those requires full server-side URL rewriting or a service
> worker (impossible on the proxy's opaque-origin sandboxed iframe). See
> "JS location assignments — why this is unsolvable in-page" below.

## Declarative refresh redirects (meta refresh / `Refresh` header)

Unlike JS `location` assignments, refresh redirects are **declarative and fully
visible server-side**, so they are fixed cleanly without any in-page hook:

- The injected shim exposes `window.__singularityProxyScheduleRefresh(delayMs,
  url)`, which after `delayMs` posts `navigate {url}` to the parent — the exact
  same parent-driven path link clicks already use (parent re-wraps through the
  proxy, pushes history, reflects the omnibox).
- `<meta http-equiv="refresh" content="…; url=…">` is replaced in the
  HTMLRewriter pass with a `<script>` calling that scheduler (URL resolved
  server-side against the real document base, JSON-encoded + `<`-escaped so a
  `</script>` in the URL can't break out). A bare-delay `<meta refresh>` with no
  `url=` is left untouched — it just re-fetches the current proxied document.
- The HTTP `Refresh` response header (never forwarded — it would escape) is
  parsed the same way and appended to the head injection as one more scheduler
  call.

`parseMetaRefresh()` (proxy `core/url.ts`) is the shared, unit-tested parser for
both the meta `content` value and the header.

## JS location assignments — why this is unsolvable in-page

`location.href = …`, `location.assign(…)`, `location.replace(…)` **cannot** be
intercepted from within the page. Per the HTML spec, every member of the
`Location` interface is `[LegacyUnforgeable]` — non-configurable *and*
non-writable — so no shim (`Object.defineProperty`, prototype override, global
shadowing) can wrap them. The frame navigates straight to the real origin and
re-hits the framing block.

Path-based URL encoding (the "server-side URL rewriting" idea) does **not** rescue
this class:

- `location.href = "/login"` (root-relative, the common case) resolves against
  the proxy *origin* → `…localhost:9000/login`, not the proxied site. `<base>`
  never governs root-relative URLs.
- `location.href = "https://real/x"` (absolute) escapes regardless of any base.
- Only directory-relative assignments (rare) would benefit — not worth the cost
  of rewriting every URL in HTML/CSS and routing every subresource through the
  proxy.

The only mechanisms that genuinely cover JS location are **(a)** full JavaScript
instrumentation (parse + rewrite every script so `location` reads go through a
proxied accessor — the testcafe-hammerhead approach; a large, brittle parser
dependency) or **(b)** a service worker (impossible on the opaque-origin
sandboxed iframe). Both are out of scope; filed as a follow-up. Same root cause
limits SPA URL reflection (`window.location` inside the frame is the proxy URL).

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
