# Cold deep-link boot saturation — deferred plugin loading + transport hoist

Companion to `research/2026-07-02-cold-deeplink-http-prime-first-value.md`.
That doc removed the **post-socket** batched sub-ack tail (`primeFromHttp`). This one
attacks the **~8s pre-socket main-thread saturation** itself — the remaining large lever
for cold-start time-to-interactive.

## Problem (re-measured on this branch, not inherited)

On a cold page load that deep-links straight into an app, ~8s of synchronous cold-boot
work runs before the notifications WebSocket can even be constructed. The socket is
leader-gated: `SharedWebSocket` only calls `new WebSocket()` from a `navigator.locks`
grant callback, a browser-scheduled task that cannot run until the main thread yields.
Nothing yields for ~8s, so the socket opens at ~8.4s.

### What actually dominates that 8s (measured)

`App.tsx`'s boot effect is strictly sequential and gates *everything* behind the full
plugin graph:

```
loadPlugins(webEntries)   // Promise.allSettled over ALL 643 plugin loaders
  → runBootTasks(...)     // boot-snapshot fetch + synchronous zod-hydration loop
  → setState(result)      // ONLY now does <NotificationsProvider> (the socket) mount
```

- **`loadPlugins` fetches + evaluates all 643 plugin chunks at boot, regardless of
  route.** `loader.ts` does `Promise.allSettled(entries.map(e => e.loader()))` over the
  *entire, unfiltered* registry. Each plugin's `web/index.ts` chunk + its static-import
  closure is parsed/evaluated on the main thread. This is the dominant, route-independent
  cost. On a deep-link to `/sonata`, the 49-plugin sonata subtree plus every *other* app
  (mail, story, workflows, browser, studio, …) and every domain all evaluate before first
  paint, even though the route needs almost none of them.
- **The eager entry chunk is NOT the problem.** Measured (fresh sourcemapped build): entry
  `index-*.js` = **932 KB raw / 200 KB gzip**, react-icons correctly tree-shaken to the
  ~259-icon eager union (an earlier "2.19 MB react-icons" reading was a `sourcesContent`
  artifact — that field holds each module's *original* source regardless of tree-shaking).
  So the icon fix (`1aeb6ca4d`) holds; the entry is fine.
- **Zod hydration** (`boot-snapshot`) parses 24 boot-critical resources in a tight
  synchronous `for` loop with zero yielding (`hydrateResource` → `schema.parse`).
- **The socket is constructed LAST** — after all 643 loads + boot tasks + `setState` — so
  its lock request isn't even *issued* until ~8s in, then queued behind the full app mount.

## Design — three layers

### Layer 1 — Hoist the notifications transport bring-up (issue the lock request at t≈0)

`getOrCreateNotifications` is already a module-level singleton with a context-free
accessor (`getNotificationsClient()`). Construct it at the **very start** of boot (first
line of App's boot effect, before `loadPlugins`), so the two `navigator.locks.request`
calls are queued immediately. The grant callback then fires during the *first* main-thread
yield (a `loadPlugins` await gap) and the socket opens early instead of at ~8.4s.
`NotificationsProvider` later calls `getOrCreateNotifications` and gets the same singleton
— single-socket-per-origin invariant preserved, no eager-WS-per-tab regression. Schemas
register later via `observe()`; the socket simply opens and waits with nothing to replay
until resources mount (identical to the normal reconnect path).

### Layer 2 — Yield during boot so queued callbacks + first paint schedule sooner

Add a `yieldToMain()` primitive (`scheduler.yield?.()` → `scheduler.postTask` →
`setTimeout(0)` fallback). Load the deferred tier (Layer 3) in **batches with a yield
between them** so no single evaluation burst monopolizes the main thread, and the queued
lock grant / paint can interleave. Chunk the boot-snapshot hydration loop with a periodic
yield (defensive — the set is small today but grows).

### Layer 3 — Deferred + incremental plugin loading (the structural bundle lever)

**Enabler (already present):** `PluginProvider.runRegisterPhase` is idempotent
(`registered` WeakSet) and its `useMemo` recomputes on a new `plugins` array reference.
So feeding it a **growing** array registers new plugins incrementally and re-renders slot
consumers automatically. No framework change needed.

**Partition rule — a pure function of `pluginPath`** (new `core/` helper
`partitionWebEntries`, co-located bun:test). Deferral is **opt-in per app** — the safe
floor, since verification (below) proved "defer all app content" unsafe:

```
deferred(pluginPath) =
  pluginPath matches  apps/plugins/<app>/plugins/<child>/…
  AND <app> ∈ DEFERRABLE_APPS  AND  child ≠ "shell"  AND  pluginPath ∉ EAGER_EXCEPTIONS
otherwise eager   (== today's behavior for every non-allowlisted plugin)
```

- **Default is eager** for the whole substrate AND every non-allowlisted app, so the change
  is byte-for-byte today's behavior except for the verified-safe apps.
- **Each deferrable app's `shell` subtree stays eager** — it registers `Apps.App` (the rail
  icon + the app's root layout component). Eager shells → the rail shows every app
  immediately; the app skeleton renders at once and its (deferred) content fills the slots
  as it streams in.
- **`DEFERRABLE_APPS`** (verified by deep-linking every route, no fatal crash / no
  boot-snapshot loss): `browser, debug, deploy, file-explorer, home, mail, pages,
  prototypes, settings, sonata, story, workflows`. **Excluded** and kept eager:
  - `studio` — the boot-critical `release.history`/`release.previews` resource **web
    descriptors** register only as a side effect of studio's release content importing
    `@plugins/release/core`; deferring it leaves boot-snapshot unable to hydrate them
    (non-fatal but files a crash report every boot + loses the pre-hydration). The coupling
    is diffuse (a whole content plugin's import side effect), not a single pinnable leaf.
  - `agent-manager` — the default app; kept eager so cold boot into the primary surface is
    unchanged.
- **`EAGER_EXCEPTIONS`** — individual deferrable-app content plugins a boot-eager surface
  hard-depends on, pinned eager while the app itself defers. Two classes today:
  - `apps/plugins/mail/plugins/sync/plugins/auto-resume` — an app-wide `Core.Root` sync
    listener (a *global, always-mounted* contribution).
  - `apps/plugins/sonata/plugins/voicing` — its web runtime exists solely to
    `ConfigV2.WebRegister({ descriptor: voicingConfig })`, which the eager `SonataProvider`
    reads via `useConfig` at mount. Pinning just this leaf lets the other ~48 sonata plugins
    defer. (The prior "21 non-shell registrations" note was inaccurate — there are 11 sonata
    config web-registrations total, and only this one is read by an eager surface; the other
    10 are read only inside their own deferred content.)
  - (Panes, sidebar entries, command-palette items, shortcuts contributed by app content are
    *not* global — they only matter on that app's own surface, so deferring them is correct.)

Because most "app content" actually lives **top-level** (`plugins/debug/*`,
`plugins/conversations/*`, `plugins/page/*`, `plugins/fields/*`), NOT nested under
`apps/plugins/<app>/`, this rule only reaches 39 of 644 plugins (6%). It is a safe first
increment that establishes the mechanism; follow-up #1/#2 unlock the large lever.

**Loader orchestration (`App.tsx`):**
1. `partitionWebEntries(webEntries)` → `{ eager, deferred }`.
2. `await loadPlugins(eager)` → run boot tasks → `setState(eager)`. Chrome paints;
   `NotificationsProvider` mounts (socket already warming from Layer 1).
3. Compute the **active app** from `window.location.pathname` via the eager-loaded
   `Apps.App` contributions (`matchAppForPath`). Its contributing shell's `pluginPath`
   gives the app root prefix `apps/plugins/<app>/`.
4. Load deferred entries **active-app-first**: the active app's subtree as one awaited
   priority batch, then the rest in yielding idle batches. As each batch resolves, append
   to the plugins array (new reference) so `PluginProvider` re-derives.

**Deferred-route loading UX:** when a deep-linked route's pane belongs to a not-yet-loaded
deferred plugin, the pane router finds no match. Expose a loader signal (loaded-plugin-id
set + "deferred load in progress" flag). The layout host renders a **loading placeholder**
for an unmatched route *while deferred loading is still in progress*, resolving to the real
pane once its plugin loads (and only falling through to not-found after loading settles).
This keeps a deep-link feeling instant (chrome + shell paint immediately) with a graceful
content-loading state, matching modern app-shell UX.

## Safety / correctness

- Default is **eager** for the whole substrate → the chrome, theme, providers, boot tasks,
  and app registrations are byte-for-byte as today. Only *app content* (which only renders
  inside its own app surface) defers.
- Incremental registration is already supported and idempotent.
- The single global-contribution exception is enumerated and covered.
- `webEntries` stays the concatenation source of truth (partition is derived), so the
  plugin-load smoke test and `--composition` builds are unaffected.

## Measured result (this branch, deployed)

Deep-linking `/sonata` (a heavy route), warm dev build:

| Signal | Before (research baseline) | After |
| --- | --- | --- |
| notifications WS **constructed** | ~8.4s | **~1.3–2.9s** |
| eager plugin evals at boot | 644 | 605 (39 deferred, 6%) |
| all 15 app routes deep-link | — | ✓ no fatal crash, no chunk 404, no boot-snapshot loss |

The socket win is the headline (Layer 1). Combined with the already-merged `primeFromHttp`,
first data now flows early. FCP/TTI is still gated by the 605-plugin eager set — the large
main-thread lever needs follow-up #1/#2 to defer sonata/studio + the top-level domains.

## Follow-ups (filed, not done here)

1. **Declarative `loadTier` + automatic safety.** Replace the runtime allowlist with a
   per-plugin/umbrella `singularity.loadTier` in `package.json` (codegen-resolved, nearest
   ancestor wins, shell auto-eager), and have codegen *automatically* keep any plugin with
   a `Core.Root`/`Core.Boot` contribution eager — so a new global listener can never be
   silently deferred. Removes the hand-maintained `EAGER_EXCEPTIONS`.
2. **Route-closure eager set.** Defer shared domains (conversations/page/tasks) too when
   the boot route doesn't need them, driven by an explicit per-app dependency manifest —
   so a `/sonata` deep-link stops eagerly loading the agent-manager domain.
3. **Idle prefetch tuning + measurement.** Add a boot-profile marker for eager-vs-deferred
   split sizes and socket-construction time, to track the win and prevent regressions.
