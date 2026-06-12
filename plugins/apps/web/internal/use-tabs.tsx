import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createPaneStore,
  setLiveStore,
  type PaneStore,
} from "@plugins/primitives/plugins/pane/web";
import { Apps } from "../slots";
import { useActiveApp } from "./use-active-app";
import {
  appPathFor,
  loadPersistedTabs,
  savePersistedTabs,
  type PersistedTab,
  type Tab,
} from "./tabs-store";

export interface TabsApi {
  tabs: Tab[];
  focusedTabId: string;
  /**
   * Per-tab resolved content title (selected page / conversation / song …),
   * keyed by tabId. Absent when the tab is at its app index or its pane has no
   * title; the tab bar falls back to the app name. Published by the per-tab
   * title reporter via {@link TabsApi.setTabTitle}.
   */
  titles: Record<string, string>;
  /** Publish (or clear, with `undefined`) the resolved content title for a tab. */
  setTabTitle(tabId: string, title: string | undefined): void;
  /** Always opens a NEW tab for `appId` (multi-instance). Returns its tabId. */
  openTab(appId: string): string;
  /** Focus the first existing tab for `appId`, else open a new one. */
  openOrFocus(appId: string): void;
  focusTab(tabId: string): void;
  closeTab(tabId: string): void;
}

const TabsContext = createContext<TabsApi | null>(null);

export function useTabs(): TabsApi {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error("useTabs() called outside <TabsProvider>.");
  }
  return ctx;
}

type AppList = ReturnType<typeof Apps.App.useContributions>;

/** Build a fresh, non-live background store bound to an app's base path. */
function makeBackgroundStore(appId: string, apps: AppList): PaneStore {
  const store = createPaneStore({ live: false });
  store.setBasePath(appPathFor(appId, apps));
  return store;
}

/** Rebuild a persisted background tab's store + route (route held in memory). */
function rebuildBackgroundTab(persisted: PersistedTab, apps: AppList): Tab {
  const store = makeBackgroundStore(persisted.appId, apps);
  if (persisted.route.length > 0) {
    store.restoreRoute(persisted.route);
  }
  return { tabId: persisted.tabId, appId: persisted.appId, store };
}

interface BootState {
  tabs: Tab[];
  focusedTabId: string;
}

/**
 * Construct the initial tab set exactly once: restore from sessionStorage, or
 * seed a single tab from the current URL's app. Pure store construction only —
 * the live-store wiring side-effect runs separately in a one-time effect.
 */
function bootTabs(apps: AppList, initialAppId: string): BootState {
  const persisted = loadPersistedTabs();
  if (persisted && persisted.tabs.length > 0) {
    const focusedTabId =
      persisted.tabs.find((t) => t.tabId === persisted.focusedTabId)?.tabId ??
      persisted.tabs[0]!.tabId;
    const tabs = persisted.tabs.map((p) => {
      if (p.tabId === focusedTabId) {
        // The focused tab is authoritative from the URL on reload: create it
        // live and let its live handleLocationChange (run by the mounted
        // renderer's useSyncPaneRegistry) hydrate the route from the URL.
        const store = createPaneStore({ live: true });
        store.setBasePath(appPathFor(p.appId, apps));
        return { tabId: p.tabId, appId: p.appId, store };
      }
      return rebuildBackgroundTab(p, apps);
    });
    return { tabs, focusedTabId };
  }
  // No persisted state — seed one tab from the current URL's app.
  const tabId = crypto.randomUUID();
  const store = createPaneStore({ live: true });
  store.setBasePath(appPathFor(initialAppId, apps));
  return { tabs: [{ tabId, appId: initialAppId, store }], focusedTabId: tabId };
}

/**
 * Owns the open-tab set and the focus model. Each tab has its own pane store;
 * exactly one store is `live` (the focused tab's). On focus switch we flip
 * liveness, repoint the imperative live store, set the new store's base path,
 * and assert its route into the URL so `useActiveApp` (URL-driven) resolves to
 * the focused tab. Persists to sessionStorage on every structural/route change.
 */
export function TabsProvider({ children }: { children: ReactNode }): ReactNode {
  const apps = Apps.App.useContributions();
  const initialApp = useActiveApp();

  // Stable refs so callbacks read the latest apps without re-creating.
  const appsRef = useRef(apps);
  appsRef.current = apps;

  const [{ tabs: initialTabs, focusedTabId: initialFocus }] = useState(() =>
    bootTabs(apps, initialApp?.id ?? "home"),
  );
  const [tabs, setTabs] = useState<Tab[]>(initialTabs);
  const [focusedTabId, setFocusedTabId] = useState<string>(initialFocus);
  // Per-tab content titles, published by the title reporter mounted inside each
  // tab's pane surface. Derived (not persisted): each tab re-reports on mount.
  const [titles, setTitles] = useState<Record<string, string>>({});

  const setTabTitle = useCallback(
    (tabId: string, title: string | undefined) => {
      setTitles((prev) => {
        if ((prev[tabId] ?? undefined) === title) return prev;
        const next = { ...prev };
        if (title === undefined) delete next[tabId];
        else next[tabId] = title;
        return next;
      });
    },
    [],
  );

  // Latest tabs/focus in refs for the persistence subscriptions + actions.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const focusedRef = useRef(focusedTabId);
  focusedRef.current = focusedTabId;

  const persist = useCallback(() => {
    savePersistedTabs(tabsRef.current, focusedRef.current);
  }, []);

  // One-time: point the imperative live store at the initially-focused tab's
  // store. (bootTabs already created it `live`; this wires the module pointer.)
  const wiredRef = useRef(false);
  if (!wiredRef.current) {
    wiredRef.current = true;
    const focused = initialTabs.find((t) => t.tabId === initialFocus);
    if (focused) setLiveStore(focused.store);
  }

  // Subscribe to each store's route changes to persist on navigation. Re-wired
  // whenever the tab set changes (covers add/close); focus/structure changes
  // call persist() directly.
  useEffect(() => {
    persist();
    const unsubs = tabs.map((t) => t.store.subscribeRoute(persist));
    return () => {
      for (const u of unsubs) u();
    };
  }, [tabs, persist]);

  /** Flip liveness from the current focused store onto `next` and mirror URL. */
  const activate = useCallback((next: Tab) => {
    const current = tabsRef.current.find((t) => t.tabId === focusedRef.current);
    if (current && current.tabId !== next.tabId) current.store.live = false;
    next.store.live = true;
    setLiveStore(next.store);
    next.store.setBasePath(appPathFor(next.appId, appsRef.current));
    // Assert the focused tab's in-memory route into the URL so it mirrors the
    // focused tab and `useActiveApp` (URL-driven) resolves to it.
    next.store.setRoute(next.store.getRoute(), /* replace */ true);
  }, []);

  const focusTab = useCallback(
    (tabId: string) => {
      const next = tabsRef.current.find((t) => t.tabId === tabId);
      if (!next || focusedRef.current === tabId) return;
      activate(next);
      focusedRef.current = tabId;
      setFocusedTabId(tabId);
      persist();
    },
    [activate, persist],
  );

  const openTab = useCallback(
    (appId: string): string => {
      const tabId = crypto.randomUUID();
      const store = makeBackgroundStore(appId, appsRef.current);
      const tab: Tab = { tabId, appId, store };
      const nextTabs = [...tabsRef.current, tab];
      tabsRef.current = nextTabs;
      setTabs(nextTabs);
      activate(tab);
      focusedRef.current = tabId;
      setFocusedTabId(tabId);
      persist();
      return tabId;
    },
    [activate, persist],
  );

  const openOrFocus = useCallback(
    (appId: string) => {
      const existing = tabsRef.current.find((t) => t.appId === appId);
      if (existing) {
        focusTab(existing.tabId);
        return;
      }
      openTab(appId);
    },
    [focusTab, openTab],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      const prev = tabsRef.current;
      const idx = prev.findIndex((t) => t.tabId === tabId);
      if (idx < 0) return;
      const remaining = prev.filter((t) => t.tabId !== tabId);
      const wasFocused = focusedRef.current === tabId;
      setTabTitle(tabId, undefined);

      if (remaining.length === 0) {
        // Never allow zero tabs — seed a fresh Home tab and focus it.
        const seedId = crypto.randomUUID();
        const store = createPaneStore({ live: false });
        const seed: Tab = { tabId: seedId, appId: "home", store };
        tabsRef.current = [seed];
        setTabs([seed]);
        activate(seed);
        focusedRef.current = seedId;
        setFocusedTabId(seedId);
        persist();
        return;
      }

      tabsRef.current = remaining;
      setTabs(remaining);

      if (wasFocused) {
        // Focus a neighbor: the tab that shifted into this index, else the new
        // last one.
        const neighbor = remaining[Math.min(idx, remaining.length - 1)]!;
        activate(neighbor);
        focusedRef.current = neighbor.tabId;
        setFocusedTabId(neighbor.tabId);
      }
      persist();
    },
    [activate, persist, setTabTitle],
  );

  const api = useMemo<TabsApi>(
    () => ({ tabs, focusedTabId, titles, setTabTitle, openTab, openOrFocus, focusTab, closeTab }),
    [tabs, focusedTabId, titles, setTabTitle, openTab, openOrFocus, focusTab, closeTab],
  );

  return <TabsContext.Provider value={api}>{children}</TabsContext.Provider>;
}
