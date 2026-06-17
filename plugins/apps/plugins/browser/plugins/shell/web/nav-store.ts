import { useMemo } from "react";
import { defineScopedStore } from "@plugins/primitives/plugins/scoped-store/web";

/**
 * Per-surface browser navigation state. The `""` sentinel in `history` means the
 * start page. The store is dumb — no IO, no URL normalization. Callers pass
 * fully-formed URLs (the omnibox owns normalization).
 */
export type BrowserNavState = {
  /** Visited URLs; `""` sentinel = start page. */
  history: string[];
  /** Pointer into `history` (current = history[index]). */
  index: number;
  /** Bump to force iframe reload. */
  loadKey: number;
  /** True between navigate/reload and the iframe `onLoad`. */
  loading: boolean;
};

const INITIAL: BrowserNavState = {
  history: [""],
  index: 0,
  loadKey: 0,
  loading: false,
};

/** Per-surface store (each surface tab gets its own isolated instance). */
export const BrowserNavStore = defineScopedStore<BrowserNavState>(INITIAL);

/** The derived navigation API consumed by the chrome bars and webview. */
export interface BrowserNavApi {
  /** `history[index]`; `""` => start page. */
  current: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  loadKey: number;
  /**
   * Truncate forward entries, push `url`, point at the end, mark loading. If
   * `url === current`, reloads instead.
   */
  navigate(url: string): void;
  back(): void;
  forward(): void;
  /** Force the iframe to remount (`loadKey++`) and mark loading. */
  reload(): void;
  /** `navigate("")` — back to the start page. */
  goHome(): void;
  /** Mark loading done (called by the webview `onLoad`). */
  finishLoad(): void;
}

/**
 * Reads the per-surface nav store and returns the imperative navigation API.
 * Must be called inside `<BrowserNavStore.Provider>`.
 */
export function useBrowserNav(): BrowserNavApi {
  const state = BrowserNavStore.useStore();
  const store = BrowserNavStore.useStoreApi();

  const actions = useMemo(() => {
    const reload = () =>
      store.setState((s) => ({ ...s, loadKey: s.loadKey + 1, loading: true }));

    const navigate = (url: string) =>
      store.setState((s) => {
        const cur = s.history[s.index] ?? "";
        if (url === cur) {
          return { ...s, loadKey: s.loadKey + 1, loading: true };
        }
        const history = [...s.history.slice(0, s.index + 1), url];
        return { ...s, history, index: history.length - 1, loading: true };
      });

    return {
      navigate,
      reload,
      back: () =>
        store.setState((s) =>
          s.index > 0 ? { ...s, index: s.index - 1, loading: true } : s,
        ),
      forward: () =>
        store.setState((s) =>
          s.index < s.history.length - 1
            ? { ...s, index: s.index + 1, loading: true }
            : s,
        ),
      goHome: () => navigate(""),
      finishLoad: () =>
        store.setState((s) => (s.loading ? { ...s, loading: false } : s)),
    };
  }, [store]);

  return {
    current: state.history[state.index] ?? "",
    canGoBack: state.index > 0,
    canGoForward: state.index < state.history.length - 1,
    loading: state.loading,
    loadKey: state.loadKey,
    ...actions,
  };
}
