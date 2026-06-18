import { useMemo } from "react";
import { defineScopedStore } from "@plugins/primitives/plugins/scoped-store/web";

/**
 * Per-surface browser tab state. Each tab is an independent navigation stack;
 * exactly one is active. The `""` sentinel in `history` means the start page.
 * The store is dumb — no IO, no URL normalization. Callers pass fully-formed
 * URLs (the omnibox owns normalization).
 */
export interface BrowserTab {
  /** Stable per-surface id (`tab-<seq>`). */
  id: string;
  /** Visited (request) URLs; `""` sentinel = start page. Drives the iframe src. */
  history: string[];
  /** Pointer into `history` (current = history[index]). */
  index: number;
  /** Bump to force this tab's iframe to remount (reload). */
  loadKey: number;
  /** True between navigate/reload and the iframe `onLoad`. */
  loading: boolean;
  /**
   * User-facing URL override for the omnibox/history/bookmarks, distinct from
   * the request URL (`history[index]`) that drives the iframe src. Set by a
   * `commit` (redirect reflection) or `sync` (SPA URL change). `null` => fall
   * back to `history[index]`. Keeping it separate keeps the iframe src stable so
   * a redirect/SPA URL change never reloads the frame.
   */
  displayUrl: string | null;
  /**
   * True when the next document `commit` is the result of a parent-initiated
   * load (navigate/back/forward/reload). It reconciles into `displayUrl` rather
   * than pushing a new history entry. Cleared once consumed.
   */
  expectCommit: boolean;
  /**
   * True when the iframe self-navigated out of the proxy and landed on an
   * un-proxied document. Caused by escapes the in-page shim can't intercept — a
   * JS `location` assignment (`location.href = …` / `.assign` / `.replace`, all
   * `[LegacyUnforgeable]`) or a scripted `form.submit()` (fires no submit event).
   * Detected as an iframe-initiated load that produced no `commit` (the real
   * origin re-blocks framing → blank frame). Surfaces the escape overlay so the
   * user can continue in their system browser. Cleared by any parent-initiated
   * navigation or a fresh commit.
   */
  escaped: boolean;
}

/** The per-surface collection of tabs with one active. */
export type BrowserTabsState = {
  tabs: BrowserTab[];
  activeId: string;
  /** Monotonic id counter — deterministic per surface (no Date.now/random). */
  seq: number;
  /**
   * Whether the framing-stripping proxy is on for this surface. When on, the
   * webview loads each tab through the same-origin proxy so framing-blocked
   * sites render. Top-level surface state (not per-tab); default on.
   */
  proxyEnabled: boolean;
};

/** A fresh tab pointed at `url` (default: the start page). */
function freshTab(seq: number, url = ""): BrowserTab {
  return {
    id: `tab-${seq}`,
    history: [url],
    index: 0,
    loadKey: 0,
    loading: url !== "",
    displayUrl: null,
    expectCommit: url !== "",
    escaped: false,
  };
}

const FIRST = freshTab(0);
const INITIAL: BrowserTabsState = {
  tabs: [FIRST],
  activeId: FIRST.id,
  seq: 1,
  proxyEnabled: true,
};

/** Per-surface store (each surface tab gets its own isolated instance). */
export const BrowserTabsStore = defineScopedStore<BrowserTabsState>(INITIAL);

/** The derived navigation API consumed by the chrome bars and webview. */
export interface BrowserNavApi {
  /**
   * Active tab's user-facing URL: `displayUrl ?? history[index] ?? ""`. Drives
   * the omnibox, history recorder, and bookmarks. `""` => start page.
   */
  current: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  loadKey: number;
  /** Active tab escaped the proxy (un-proxied self-navigation); drives the escape overlay. */
  escaped: boolean;
  /**
   * Truncate forward entries, push `url`, point at the end, mark loading. If
   * `url === current`, reloads instead. Operates on the active tab. Clears
   * `displayUrl` and arms `expectCommit`.
   */
  navigate(url: string): void;
  back(): void;
  forward(): void;
  /** Force the active tab's iframe to remount (`loadKey++`) and mark loading. */
  reload(): void;
  /** `navigate("")` — back to the start page. */
  goHome(): void;
  /** Mark the active tab's load done (called by the webview `onLoad`). */
  finishLoad(): void;
  /**
   * The iframe committed a full document at `url` (post-redirect / POST landing).
   * If `expectCommit` (a parent-initiated load): reconcile into `displayUrl`
   * (redirect reflection) — no history mutation, no reload. Otherwise (an
   * iframe-driven load, e.g. a PRG POST landing): push a new history entry so
   * back/forward + reload behave correctly.
   */
  commit(url: string): void;
  /** SPA in-page URL change — update the omnibox display only, nothing else. */
  syncDisplay(url: string): void;
  /**
   * Mark the active tab as escaped (an un-proxied self-navigation the shim
   * couldn't intercept). Called by the webview when an iframe-initiated load
   * completes without a `commit`. Also clears `loading` (the frame "loaded").
   */
  markEscaped(): void;
  /** Dismiss the escape overlay on the active tab (escaped → false). */
  clearEscaped(): void;
}

/**
 * Reads the active tab and returns the imperative navigation API. Unchanged
 * surface vs. the original single-stack store — every existing consumer keeps
 * working. Must be called inside `<BrowserTabsStore.Provider>`.
 */
export function useBrowserNav(): BrowserNavApi {
  const state = BrowserTabsStore.useStore();
  const store = BrowserTabsStore.useStoreApi();
  // By invariant the store always holds ≥1 tab; the `freshTab` fallback only
  // satisfies the type system and is never reached in practice.
  const active =
    state.tabs.find((t) => t.id === state.activeId) ??
    state.tabs[0] ??
    freshTab(0);

  const actions = useMemo(() => {
    const patchActive = (fn: (t: BrowserTab) => BrowserTab) =>
      store.setState((s) => ({
        ...s,
        tabs: s.tabs.map((t) => (t.id === s.activeId ? fn(t) : t)),
      }));

    const reload = () =>
      patchActive((t) => ({
        ...t,
        loadKey: t.loadKey + 1,
        loading: true,
        displayUrl: null,
        expectCommit: true,
        escaped: false,
      }));

    const navigate = (url: string) =>
      patchActive((t) => {
        const cur = t.history[t.index] ?? "";
        if (url === cur) {
          // Same URL: reload (the start page has no iframe, so never "loading").
          return {
            ...t,
            loadKey: t.loadKey + 1,
            loading: url !== "",
            displayUrl: null,
            expectCommit: url !== "",
            escaped: false,
          };
        }
        const history = [...t.history.slice(0, t.index + 1), url];
        return {
          ...t,
          history,
          index: history.length - 1,
          loading: url !== "",
          displayUrl: null,
          expectCommit: url !== "",
          escaped: false,
        };
      });

    const commit = (url: string) =>
      patchActive((t) => {
        if (t.expectCommit) {
          // Parent-initiated load completed: reflect a redirect via displayUrl
          // (no history mutation, no reload). Clear the expectation.
          const requestUrl = t.history[t.index] ?? "";
          return {
            ...t,
            displayUrl: url !== requestUrl ? url : null,
            expectCommit: false,
            escaped: false,
          };
        }
        // Iframe-driven landing (e.g. a PRG POST): push a real history entry so
        // back/forward + reload re-GET it. The iframe already shows it; its src
        // updates to proxyUrl(url) on its own (accepted PRG re-GET).
        const history = [...t.history.slice(0, t.index + 1), url];
        return {
          ...t,
          history,
          index: history.length - 1,
          displayUrl: null,
          escaped: false,
        };
      });

    const syncDisplay = (url: string) =>
      patchActive((t) => ({ ...t, displayUrl: url }));

    const markEscaped = () =>
      patchActive((t) =>
        t.escaped ? t : { ...t, escaped: true, loading: false },
      );

    const clearEscaped = () =>
      patchActive((t) => (t.escaped ? { ...t, escaped: false } : t));

    return {
      navigate,
      reload,
      commit,
      syncDisplay,
      markEscaped,
      clearEscaped,
      back: () =>
        patchActive((t) =>
          t.index > 0
            ? {
                ...t,
                index: t.index - 1,
                loading: (t.history[t.index - 1] ?? "") !== "",
                displayUrl: null,
                expectCommit: (t.history[t.index - 1] ?? "") !== "",
                escaped: false,
              }
            : t,
        ),
      forward: () =>
        patchActive((t) =>
          t.index < t.history.length - 1
            ? {
                ...t,
                index: t.index + 1,
                loading: (t.history[t.index + 1] ?? "") !== "",
                displayUrl: null,
                expectCommit: (t.history[t.index + 1] ?? "") !== "",
                escaped: false,
              }
            : t,
        ),
      goHome: () => navigate(""),
      finishLoad: () =>
        patchActive((t) => (t.loading ? { ...t, loading: false } : t)),
    };
  }, [store]);

  return {
    current: active.displayUrl ?? active.history[active.index] ?? "",
    canGoBack: active.index > 0,
    canGoForward: active.index < active.history.length - 1,
    loading: active.loading,
    loadKey: active.loadKey,
    escaped: active.escaped,
    ...actions,
  };
}

/** A flattened view of one tab for the strip and the viewport. */
export interface BrowserTabSummary {
  id: string;
  /** `history[index]`; `""` => start page. */
  url: string;
  loadKey: number;
  loading: boolean;
  active: boolean;
  /** True when this tab escaped the proxy (drives the escape overlay). */
  escaped: boolean;
}

/** The tab-collection API consumed by the tab strip and the webview. */
export interface BrowserTabsApi {
  tabs: BrowserTabSummary[];
  activeId: string;
  /** Make `id` the active tab (no-op if already active). */
  select(id: string): void;
  /** Open a new tab (start page if no `url`). Becomes active unless `background`. */
  open(url?: string, opts?: { background?: boolean }): void;
  /** Close `id`; selects a neighbor if it was active. Closing the last tab resets to one fresh start-page tab. */
  close(id: string): void;
  /** Mark a specific tab's load complete (the webview `onLoad`). */
  finishLoad(id: string): void;
}

/**
 * Reads the tab collection and returns the imperative tab API. Must be called
 * inside `<BrowserTabsStore.Provider>`.
 */
export function useBrowserTabs(): BrowserTabsApi {
  const state = BrowserTabsStore.useStore();
  const store = BrowserTabsStore.useStoreApi();

  const actions = useMemo(
    () => ({
      select: (id: string) =>
        store.setState((s) =>
          s.activeId === id ? s : { ...s, activeId: id },
        ),
      open: (url = "", opts?: { background?: boolean }) =>
        store.setState((s) => {
          const tab = freshTab(s.seq, url);
          return {
            ...s,
            tabs: [...s.tabs, tab],
            seq: s.seq + 1,
            activeId: opts?.background ? s.activeId : tab.id,
          };
        }),
      close: (id: string) =>
        store.setState((s) => {
          const idx = s.tabs.findIndex((t) => t.id === id);
          if (idx === -1) return s;
          const remaining = s.tabs.filter((t) => t.id !== id);
          if (remaining.length === 0) {
            const tab = freshTab(s.seq);
            return { ...s, tabs: [tab], activeId: tab.id, seq: s.seq + 1 };
          }
          let { activeId } = s;
          if (activeId === id) {
            // Select the neighbor that visually takes the closed tab's place.
            const neighbor = remaining[Math.min(idx, remaining.length - 1)];
            if (neighbor) activeId = neighbor.id;
          }
          return { ...s, tabs: remaining, activeId };
        }),
      finishLoad: (id: string) =>
        store.setState((s) => ({
          ...s,
          tabs: s.tabs.map((t) =>
            t.id === id && t.loading ? { ...t, loading: false } : t,
          ),
        })),
    }),
    [store],
  );

  return {
    tabs: state.tabs.map((t) => ({
      id: t.id,
      url: t.history[t.index] ?? "",
      loadKey: t.loadKey,
      loading: t.loading,
      active: t.id === state.activeId,
      escaped: t.escaped,
    })),
    activeId: state.activeId,
    ...actions,
  };
}

/** The per-surface proxy-mode API consumed by the proxy toggle + webview. */
export interface BrowserProxyApi {
  /** Whether the framing-stripping proxy is on for this surface. */
  enabled: boolean;
  /** Flip the proxy on/off for this surface. */
  toggle(): void;
}

/**
 * Reads the surface's proxy-mode flag and returns its toggle. Must be called
 * inside `<BrowserTabsStore.Provider>`.
 */
export function useBrowserProxy(): BrowserProxyApi {
  const state = BrowserTabsStore.useStore();
  const store = BrowserTabsStore.useStoreApi();

  const toggle = useMemo(
    () => () =>
      store.setState((s) => ({ ...s, proxyEnabled: !s.proxyEnabled })),
    [store],
  );

  return { enabled: state.proxyEnabled, toggle };
}
