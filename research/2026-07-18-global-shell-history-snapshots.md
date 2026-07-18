# Shell-level history snapshots — correct browser back/forward across apps and tabs

## Context

Browser back/forward is broken in the shell:

1. `/story` → rail-click Settings → Back does **not** return to `/story`. Cross-app navigation swaps the focused tab's app in place and mirrors the URL with `replaceState` (`activate()` in `use-tabs.tsx` hard-codes `replace=true`), so no history entry is ever created for an app switch.
2. `/agents/c/conv-X` → `/settings` → Back lands on an **older** `/agents` entry (the conv entry was replaced away), and the UI hard-desyncs: the theme flips to agents (chrome derives app identity from the URL via `useActiveApp`/`matchAppForPath`) while the content still shows Settings (the surface derives from the focused tab's `appId`, which nothing re-syncs on popstate). On the next reload, `bootTabs` sees URL-app ≠ focused-tab-app and mints a phantom tab — the "tabs appear I never created" bug.

Root cause: the pane layer already follows "store is source of truth, URL/history is a derived projection" — but the principle stops at the pane level. History entries only encode the *route within an app* (`history.state = {route}|{pending}`); the app/tab identity is carried by the URL alone and never restored from history. Two independent app-identity sources (URL-parsing for chrome, tab state for content) can diverge.

## Mental model (goes into pane + tabs CLAUDE.md)

The shell has one source of truth per tab (the pane store's in-memory route) and **one linear browser-history timeline that is a pure projection of it**. A history entry is a **complete snapshot of what the user was looking at**: `{ tabId, appId, route | pending }`. Nothing reads the URL to decide identity — the URL and `history.state` are write-only projections; `popstate` is the one place they are read back, restoring the snapshot (refocus the tab, re-sync its app in place, restore the route in memory) with **zero URL parsing**. There is exactly **one** owner of `window.history` and exactly **one** `popstate` listener. The pane primitive stays app-agnostic: it emits push/replace *intents* through an injected `HistoryAdapter`; the tabs layer installs the app-aware adapter. App identity for chrome (rail highlight, theme scope, `:root` tokens) derives from the focused tab's `appId`, not the URL — the theme/content divergence class becomes structurally impossible.

**Push rule:** every user-initiated change to *what is on screen* pushes (pane open/close, `navigate()`, rail click, open-tab, **focus-tab** — user decision: Back/Forward traverses tab focus too). **Replace** only for corrections that must not be independently reachable: boot hydration, canonicalization redirect, close-tab refocus, same-URL dedupe.

## Design

### 1. `HistoryAdapter` seam (pane stays app-agnostic)

New file `plugins/primitives/plugins/pane/web/history-sink.ts`:

```ts
export type SerializedSlot = { paneId: string; params: Record<string, string>; options: PaneOptions; uuid: string };
export type PaneHistoryState = { route: SerializedSlot[] } | { pending: string };

export interface LocationChange {
  url: string;                 // full pathname, base path already applied
  state: PaneHistoryState;     // pane's route payload
  mode: "push" | "replace";
}

export interface HistoryAdapter {
  commit(change: LocationChange): void;  // project an in-memory change onto the browser
  restore(): void;                       // real browser back/forward → rebuild in-memory state
}
```

Module pointer + `setHistoryAdapter()` (mirrors `setLiveStore`/`setTabsNavigator`). `defaultHistoryAdapter` preserves standalone/test behavior: `commit` writes `state` verbatim + dispatches `shell:navigate`; `restore` calls `liveStore.handleLocationChange()`.

**`pane.ts` keeps:** the route store, `parseUrl`, `handleLocationChange` (unchanged — it ignores extra `tabId`/`appId` keys in `history.state`), `live`, `setLiveStore`, and the single module-level `popstate` listener.

**`pane.ts` loses:** direct `window.history[method]` calls in `setRoute`/`navigatePending` (→ `historyAdapter.commit(...)`) **and the synthetic `PopStateEvent` dispatch**. New event contract:

- `commit` dispatches **`shell:navigate` only** (all reactivity consumers — `usePathname`, `useActiveApp`, pane-restore — already listen to it; verified).
- The module listener listens to **real `popstate` only** → `historyAdapter.restore()`.

This kills the synthetic-popstate/`routesEqual`-bail dance: programmatic navigation = `shell:navigate`; browser traversal = `popstate`. A hard contract instead of idempotency-by-comparison.

### 2. Shell adapter (tabs layer owns restoration)

New file `plugins/apps-core/plugins/tabs/web/internal/shell-history-adapter.ts`, installed by `TabsProvider` in its wiring effect.

- `commit`: merge `{tabId, appId}` (from the provider's snapshot ref) into `state`, then `window.history[mode](compositeState, "", url)` + `shell:navigate`. This file joins the `no-raw-history-nav` lint exemption list (the new sanctioned low-level writer).
- `restore()` — runs after the browser already updated URL + `history.state`:
  1. Read `window.history.state` → `{ tabId?, appId?, route?, pending? }`.
  2. **Legacy/`{}` entry** (pre-deploy entries, apps-layout redirect): resolve app from URL via `matchAppForPath`, reconcile the focused tab to it in place (**no history write**), `liveStore.handleLocationChange()`, `setFocusedApp`. Return.
  3. Find `tab` by `state.tabId`.
  4. **Closed-tab entry**: apply `{appId, route|pending}` to the *focused* tab via in-place app swap (no history write, no tab minting — minting would grow unboundedly under back/forward and the dead `tabId` can't be revived). Forward re-applies symmetrically.
  5. **Refocus** if needed: flip `live`, `setLiveStore`, update refs + `setFocusedTabId`.
  6. **Re-sync app** if `tab.appId !== state.appId`: rebuild the tab's store bound to `state.appId` (shared `rebuildTabApp(tabId, appId, target, {mirror: false})` helper — restoration must never write history). *This is bug 2's core fix.*
  7. **Restore the route**: `liveStore.handleLocationChange()` reads `state.route`/`state.pending`. One code path for all cases.
  8. `setFocusedApp(state.appId)` synchronously, then `persist()`.

Ordering guarantee: chrome identity (`focusedApp` module signal) and content (`tab.appId`/`focusedTabId` React state) both derive from the one `restore()` mutation — they can never race the URL.

### 3. Push/replace matrix

| Source | Mode |
|---|---|
| pane open / close / promote / reorder | **push** (as today) |
| `navigate()` same-app (resolved or pending) | **push** |
| `navigate()` cross-app / rail click (`replaceTabAppWith*` → `activate`) | **push** ← headline fix (was replace) |
| `openTab` (+ button) | **push** |
| `focusTab` (click a tab) | **push** ← user decision: Back refocuses the previous tab |
| `closeTab` refocus neighbor | **replace** (top entry points at a destroyed tab) |
| `bootTabs` initial stamp | **replace** (stamps the composite `{tabId, appId, route}` over whatever boot left) |
| apps-layout canonicalization redirect | **replace** (unchanged; re-stamped by boot) |
| back/forward (`restore()`) | **none** — restoration never writes history |

Mechanically: `activate(next, target?, mode: "push" | "replace" = "push")`, threading mode from each caller; the URL mirror uses `mode` instead of the hard-coded `replace=true`. Keep the same-URL dedupe so re-asserting an identical URL never double-pushes.

### 4. One app-identity source for chrome

- New `plugins/apps-core/web/internal/focused-app-store.ts`: `setFocusedApp` / `useFocusedAppId` module store (same pattern as `focusedSurfaceId`/`surfaceMode`). `TabsProvider` publishes on every focus/app change; the shell adapter publishes during `restore()`.
- `use-active-app.ts`: outside a `PaneSurfaceProvider`, return the app for `useFocusedAppId()`; fall back to `matchAppForPath(pathname)` only when unset (pre-TabsProvider mount).
- `apps-layout.tsx` redirect gate: switch its `matched` check to explicit `matchAppForPath(pathname, apps)` — canonicalization is legitimately URL-driven and must stay so; don't conflate it with chrome identity.

### 5. `bootTabs` under the new model

Unchanged matching logic (URL wins, prefer existing tab of the URL's app), but boot now **replace-stamps** the initial composite entry via `activate(focused, undefined, "replace")`. Since `tabId`s are persisted per-browser-tab in sessionStorage and rebuilt with the same ids, `history.state.tabId` written before a reload still matches after it — **back/forward keeps working across reloads**. The phantom-tab mint branch stays as the genuine-deep-link fallback but no longer fires from desync (popstate now re-syncs `appId`).

## Edge cases

- **Lazy/pending routes**: entry carries `{tabId, appId, pending}`; `restore()` swaps to `appId` regardless of plugin load state, `handleLocationChange` seeds pending, tri-state fallback shows the spinner. Same as cold pending today, now tab-aware.
- **Duplicate browser tab**: sessionStorage copies, ids line up — behavior unchanged (not a goal here).
- **pane-restore listener** (`conversations/pane-restore`): reads `getRoute()` off the live store after debounce; still correct after `restore()` repoints `liveStore`. No change.
- **Migration**: none needed. Old `{route}`/`{pending}`/`{}` entries hit the legacy branch (URL reparse); history is session-scoped and washes out.

## File-by-file changes

| File | Change | Effort |
|---|---|---|
| `plugins/primitives/plugins/pane/web/history-sink.ts` (new) | adapter interface, default adapter, module pointer + setter | M |
| `plugins/primitives/plugins/pane/web/pane.ts` | `setRoute`/`navigatePending` → `commit`; drop synthetic popstate; popstate-only listener → `restore()` | M (load-bearing) |
| `plugins/apps-core/plugins/tabs/web/internal/shell-history-adapter.ts` (new) | composite stamping + 8-step restore | L |
| `plugins/apps-core/plugins/tabs/web/internal/use-tabs.tsx` | `activate(mode)`, push/replace threading, `rebuildTabApp(..., {mirror})` extraction, adapter install/teardown, `setFocusedApp` publication, boot stamp | L |
| `plugins/apps-core/web/internal/focused-app-store.ts` (new) | focused-app module store | S |
| `plugins/apps-core/web/internal/use-active-app.ts` | tabs-derived identity with pre-mount URL fallback | M |
| `plugins/apps-core/web/index.ts` | export `setFocusedApp`/`useFocusedAppId` | S |
| `plugins/apps-core/plugins/layout/web/components/apps-layout.tsx` | redirect gate uses explicit `matchAppForPath` | S |
| `plugins/apps-core/lint/index.ts` | exempt `shell-history-adapter.ts` from `no-raw-history-nav` | S |
| `plugins/primitives/plugins/pane/CLAUDE.md`, `plugins/apps-core/plugins/tabs/CLAUDE.md` | document the snapshot model | S |

## Tests

- **Pane (vitest, `pane/web/__tests__/`)**: stub adapter receives `commit` with correct mode for open/close/promote; `restore()` fires on popstate; default adapter standalone behavior unchanged when no shell adapter installed.
- **Tabs (vitest, `tabs/web/__tests__/`, extend `boot-tabs.test.ts` + new `shell-history-adapter.test.ts`)**: cross-app `navigate()` pushes a composite `{tabId,appId,route}`; restore with foreign `tabId` refocuses; restore with same `tabId` + different `appId` swaps app in place (bug 2); closed-tab entry applies to focused tab, mints nothing; legacy `{route}` entry falls back to URL reparse; `focusTab`/`openTab` push, `closeTab` replaces; boot replace-stamps the composite.

## Verification (Playwright e2e, `bun e2e/screenshot.mjs` or scripted)

1. **Repro 1**: `/story` → rail-click Settings → Back returns to `/story` (content + rail highlight + theme all story); Forward → Settings.
2. **Repro 2**: `/agents/c/conv-X` → navigate `/settings` → Back lands on `/agents/c/conv-X` exactly; theme AND content both agents. Reload → no phantom tab.
3. **Cross-tab**: tab A `/story`, open tab B `/settings` → Back refocuses A; Forward refocuses B.
4. **In-tab**: open a pane, Back pops just the pane, not the app.
5. **Lazy app**: back/forward onto a deferred app shows spinner then resolves; identity correct throughout.
6. **Reload mid-history**: `/story` → Settings → reload → Back still returns to `/story` (tabId survival).
7. **Close-tab**: tabs [A,B], focused B, close B → focus A; Back does not resurrect B.
