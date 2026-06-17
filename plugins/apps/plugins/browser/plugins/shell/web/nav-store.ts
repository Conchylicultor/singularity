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
  /** Visited URLs; `""` sentinel = start page. */
  history: string[];
  /** Pointer into `history` (current = history[index]). */
  index: number;
  /** Bump to force this tab's iframe to remount (reload). */
  loadKey: number;
  /** True between navigate/reload and the iframe `onLoad`. */
  loading: boolean;
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
  /** Active tab's `history[index]`; `""` => start page. */
  current: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  loadKey: number;
  /**
   * Truncate forward entries, push `url`, point at the end, mark loading. If
   * `url === current`, reloads instead. Operates on the active tab.
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
      patchActive((t) => ({ ...t, loadKey: t.loadKey + 1, loading: true }));

    const navigate = (url: string) =>
      patchActive((t) => {
        const cur = t.history[t.index] ?? "";
        if (url === cur) {
          // Same URL: reload (the start page has no iframe, so never "loading").
          return { ...t, loadKey: t.loadKey + 1, loading: url !== "" };
        }
        const history = [...t.history.slice(0, t.index + 1), url];
        return {
          ...t,
          history,
          index: history.length - 1,
          loading: url !== "",
        };
      });

    return {
      navigate,
      reload,
      back: () =>
        patchActive((t) =>
          t.index > 0
            ? {
                ...t,
                index: t.index - 1,
                loading: (t.history[t.index - 1] ?? "") !== "",
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
              }
            : t,
        ),
      goHome: () => navigate(""),
      finishLoad: () =>
        patchActive((t) => (t.loading ? { ...t, loading: false } : t)),
    };
  }, [store]);

  return {
    current: active.history[active.index] ?? "",
    canGoBack: active.index > 0,
    canGoForward: active.index < active.history.length - 1,
    loading: active.loading,
    loadKey: active.loadKey,
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
