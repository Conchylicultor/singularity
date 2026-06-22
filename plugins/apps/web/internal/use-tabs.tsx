import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  createPaneStore,
  parseUrl,
  setLiveStore,
  type PaneSlot,
  type PaneStore,
} from "@plugins/primitives/plugins/pane/web";
import { setFocusedSurfaceId } from "@plugins/primitives/plugins/shortcuts/web";
import { type Placement } from "../../core";
import { Apps } from "../slots";
import { getDefaultPlacement } from "./placement-registry";
import { useActiveApp } from "./use-active-app";
import { defaultApp, resolveAppForPath } from "./resolve-app";
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
  /**
   * Always opens a NEW tab for `appId` (multi-instance), with the given spatial
   * `placement` (defaults to the registry default placement). Passing the
   * focused tab's placement makes the `+` button a "new window" affordance while
   * in desktop mode. Returns its tabId.
   */
  openTab(appId: string, placement?: Placement): string;
  /** Swap `tabId`'s app in place (keeps the tabId) and focus it. */
  replaceTabApp(tabId: string, appId: string): void;
  /**
   * THE sanctioned cross-app navigation: resolve `url` to its owning app (by
   * longest-prefix path match), swap the focused tab to that app in place, and
   * set its route from the URL — all through the live pane store, so
   * the focused tab's `appId` can never drift from the URL. Use this anywhere
   * you'd reach for `window.history.pushState` (enforced by `no-raw-history-nav`).
   */
  navigate(url: string): void;
  focusTab(tabId: string): void;
  closeTab(tabId: string): void;
  /** Reorder: move the tab `activeId` to the position of `overId`. */
  moveTab(activeId: string, overId: string): void;
  /**
   * Set a tab's spatial placement (docked / floating / solo). Pure per-tab
   * state — focus, route, and store liveness are untouched; the `surface`
   * plugin re-positions the (still-mounted) tab in response, so a placement
   * change never reloads the tab.
   */
  setPlacement(tabId: string, placement: Placement): void;
}

const TabsContext = createContext<TabsApi | null>(null);

// Module-level handle to the mounted provider's `navigate`, mirroring the
// `setLiveStore`/`liveStore` pointer in the pane primitive. Lets callers that
// render OUTSIDE `<TabsProvider>` (e.g. the floating action bar, a sibling
// `Core.Root`) reach the one sanctioned cross-app navigation without the hook.
let tabsNavigator: ((url: string) => void) | null = null;

function setTabsNavigator(fn: ((url: string) => void) | null): void {
  tabsNavigator = fn;
}

/**
 * Free-function form of {@link TabsApi.navigate} — the cross-app navigation
 * primitive callable from anywhere, including outside `<TabsProvider>`. Throws
 * if invoked before the provider has mounted (a real bug: there is nothing to
 * navigate yet).
 */
export function navigate(url: string): void {
  if (!tabsNavigator) {
    throw new Error("navigate() called before <TabsProvider> mounted.");
  }
  tabsNavigator(url);
}

// Module-level handle to the focused tab's placement + a setter, mirroring the
// `tabsNavigator` pattern above. Lets out-of-provider callers (the floating
// action bar's placement control, the global Esc shortcut) read/drive the
// focused tab's placement without the `useTabs` hook. A subscribable snapshot
// (useFocusedPlacement) keeps those consumers reactive.
// eslint-disable-next-line scoped-store/no-module-mutable-store -- page-global by design: the FOCUSED tab's placement, mirroring tabsNavigator/focusedSurfaceId. Driven by single global chrome (the floating-bar placement control + global Esc) outside any surface tree, so it cannot be a per-surface scoped store.
let focusedPlacement: Placement = "";
let setFocusedPlacementFn: ((placement: Placement) => void) | null = null;
const focusedPlacementSubscribers = new Set<() => void>();

function publishFocusedPlacement(
  placement: Placement,
  setter: ((placement: Placement) => void) | null,
): void {
  setFocusedPlacementFn = setter;
  if (placement !== focusedPlacement) {
    focusedPlacement = placement;
    for (const fn of focusedPlacementSubscribers) fn();
  }
}

/**
 * Imperatively set the focused tab's placement from anywhere — the persistent
 * home for the placement control on the floating action bar, and the Esc-exit
 * shortcut. No-op (rather than throw) before the provider mounts: a stray
 * shortcut keystroke pre-mount is benign, not a bug.
 */
export function setFocusedTabPlacement(placement: Placement): void {
  setFocusedPlacementFn?.(placement);
}

/**
 * Non-hook read of the focused tab's placement — for plain-function callers
 * (e.g. a shortcut `when`/`handler` guard) that can't use the hook form.
 */
export function getFocusedPlacement(): Placement {
  return focusedPlacement;
}

/**
 * Reactive read of the focused tab's placement, callable outside
 * `<TabsProvider>`. Backs the floating-bar placement control + solo exit.
 */
export function useFocusedPlacement(): Placement {
  return useSyncExternalStore(
    (cb) => {
      focusedPlacementSubscribers.add(cb);
      return () => focusedPlacementSubscribers.delete(cb);
    },
    () => focusedPlacement,
    () => focusedPlacement,
  );
}

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
  return {
    tabId: persisted.tabId,
    appId: persisted.appId,
    store,
    placement: persisted.placement ?? getDefaultPlacement(),
  };
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
function bootTabs(apps: AppList, seedAppId: string): BootState {
  // The current URL — not the persisted focus — is authoritative for which
  // app/pane is focused on load. Resolve it up front (same source of truth as
  // the cross-app `navigate()`), so a reload or deep link always lands on the
  // URL's app, never the last-focused app from a previous session.
  const resolved = resolveAppForPath(window.location.pathname, apps);
  const urlAppId = resolved?.app.id ?? seedAppId;
  const urlRoute = resolved ? (parseUrl(resolved.routePath) ?? []) : [];

  // Rebuild every persisted tab as a background tab. Keep-alive must survive a
  // reload, so no other app's tab is dropped; the focused tab is chosen and made
  // live from the URL below.
  const persisted = loadPersistedTabs();
  const tabs: Tab[] = (persisted?.tabs ?? []).map((p) =>
    rebuildBackgroundTab(p, apps),
  );

  // Pick which tab the URL focuses: the persisted focused tab when it already
  // belongs to the URL's app (the normal reload), else the first tab on that
  // app, else a fresh tab so the URL's app is never silently dropped.
  let focusIdx = tabs.findIndex(
    (t) => t.tabId === persisted?.focusedTabId && t.appId === urlAppId,
  );
  if (focusIdx < 0) focusIdx = tabs.findIndex((t) => t.appId === urlAppId);
  if (focusIdx < 0) {
    tabs.push({
      tabId: crypto.randomUUID(),
      appId: urlAppId,
      store: makeBackgroundStore(urlAppId, apps),
      placement: getDefaultPlacement(),
    });
    focusIdx = tabs.length - 1;
  }

  // Promote the chosen tab to the live focused tab, hydrating its route from the
  // address bar (the URL wins over the tab's own persisted route). Seed while
  // still background so it's an in-memory update with no spurious history entry,
  // then flip it live.
  const focused = tabs[focusIdx]!;
  focused.store.setBasePath(appPathFor(focused.appId, apps));
  if (urlRoute.length > 0) focused.store.restoreRoute(urlRoute);
  else focused.store.clearRoute();
  focused.store.live = true;

  return { tabs, focusedTabId: focused.tabId };
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
    bootTabs(apps, initialApp?.id ?? defaultApp(apps)?.id ?? ""),
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

  /**
   * Flip liveness from the current focused store onto `next` and mirror its
   * route into the URL. When `targetRoute` is given (cross-app navigation), it
   * is seeded into the still-background store FIRST — a background `setRoute` is
   * an in-memory-only update (no history op), so the single live mirror below
   * lands directly on the target URL in one `replaceState`, with no stray
   * intermediate entry at the bare app root and no double event dispatch.
   */
  const activate = useCallback((next: Tab, targetRoute?: PaneSlot[]) => {
    const current = tabsRef.current.find((t) => t.tabId === focusedRef.current);
    if (current && current.tabId !== next.tabId) current.store.live = false;
    next.store.setBasePath(appPathFor(next.appId, appsRef.current));
    // Seed the target route while still background (in-memory only).
    if (targetRoute) next.store.setRoute(targetRoute);
    next.store.live = true;
    setLiveStore(next.store);
    // Assert the (now possibly seeded) in-memory route into the URL so it
    // mirrors the focused tab and `useActiveApp` (URL-driven) resolves to it.
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

  /**
   * Open a new tab for `appId` at its index. Used by the `+` new-tab button,
   * which passes the focused tab's placement so `+` spawns a floating "new
   * window" while in desktop mode and a docked tab otherwise.
   */
  const openTab = useCallback(
    (appId: string, placement?: Placement): string => {
      const p = placement ?? getDefaultPlacement();
      const tabId = crypto.randomUUID();
      const store = makeBackgroundStore(appId, appsRef.current);
      const tab: Tab = { tabId, appId, store, placement: p };
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

  // Swap a tab's app in place (keeps the tabId + position), seeding `route` into
  // the fresh store before it goes live. The launcher (Home) tab and the rail
  // navigate INTO the picked app instead of spawning a tab beside it; a
  // cross-app deep-link lands the focused tab directly on its target route.
  const replaceTabAppWithRoute = useCallback(
    (tabId: string, appId: string, route: PaneSlot[]) => {
      const idx = tabsRef.current.findIndex((t) => t.tabId === tabId);
      if (idx < 0) return;
      // Preserve the tab's existing placement — swapping the app in place must
      // not relocate the tab (e.g. picking an app from Home inside a floating
      // tab keeps it floating, never resets it to the default / background).
      const placement = tabsRef.current[idx]!.placement;
      tabsRef.current[idx]!.store.live = false;
      const store = makeBackgroundStore(appId, appsRef.current);
      const tab: Tab = { tabId, appId, store, placement };
      const nextTabs = [...tabsRef.current];
      nextTabs[idx] = tab;
      tabsRef.current = nextTabs;
      setTabs(nextTabs);
      activate(tab, route);
      focusedRef.current = tabId;
      setFocusedTabId(tabId);
      persist();
    },
    [activate, persist],
  );

  const replaceTabApp = useCallback(
    (tabId: string, appId: string) => replaceTabAppWithRoute(tabId, appId, []),
    [replaceTabAppWithRoute],
  );

  const navigate = useCallback(
    (url: string) => {
      // Strip any query/hash — routing is path-based.
      const pathname = url.split(/[?#]/)[0] ?? url;
      const resolved = resolveAppForPath(pathname, appsRef.current);
      if (!resolved) {
        // No registered app owns this path, so navigation cannot proceed. Every
        // real caller passes an app-rooted path (/agents/…, /story/…); reaching
        // here means a caller built a malformed link — e.g. a notification linkTo
        // missing its /agents prefix. Throw instead of silently no-opping: an
        // uncaught error in this event-handler is caught by the global crash
        // collector and filed as a deduped report+task, so the structural bug
        // surfaces and gets fixed rather than manifesting as a dead, silent click.
        throw new Error(
          `navigate(): no registered app owns path "${pathname}" — the link is unrooted or points to an unregistered app`,
        );
      }
      const route = parseUrl(resolved.routePath) ?? [];
      const focused = tabsRef.current.find((t) => t.tabId === focusedRef.current);
      if (focused && focused.appId === resolved.app.id) {
        // Already on this app — set the route on its live store (normal push,
        // preserving a back target).
        focused.store.setRoute(route);
        return;
      }
      // Cross-app: swap the focused tab's app in place AND seed the target
      // route, so the focused tab's appId always matches the URL (no desync) —
      // consistent with the rail's in-place app switch.
      replaceTabAppWithRoute(focusedRef.current, resolved.app.id, route);
    },
    [replaceTabAppWithRoute],
  );

  // Push focus changes into the shortcuts focused-surface signal (push-based, no
  // polling) so surface-scoped shortcuts read the focused surface from the
  // window keydown handler outside any React subtree.
  useEffect(() => {
    setFocusedSurfaceId(focusedTabId);
  }, [focusedTabId]);

  // Publish the cross-app navigator at module scope so out-of-provider callers
  // (the floating bar, a sibling Core.Root) can reach it via the free
  // `navigate()` export. Mirrors the pane primitive's `setLiveStore` handle.
  useEffect(() => {
    setTabsNavigator(navigate);
    return () => setTabsNavigator(null);
  }, [navigate]);

  const closeTab = useCallback(
    (tabId: string) => {
      const prev = tabsRef.current;
      const idx = prev.findIndex((t) => t.tabId === tabId);
      if (idx < 0) return;
      const remaining = prev.filter((t) => t.tabId !== tabId);
      const wasFocused = focusedRef.current === tabId;
      setTabTitle(tabId, undefined);

      if (remaining.length === 0) {
        // Never allow zero tabs — seed a fresh default-app tab and focus it.
        // Bail if no apps are registered (nothing to seed; the surface stays
        // empty, which is the only sane outcome with an empty registry).
        const seedApp = defaultApp(appsRef.current);
        if (!seedApp) return;
        const seedId = crypto.randomUUID();
        const store = createPaneStore({ live: false });
        const seed: Tab = {
          tabId: seedId,
          appId: seedApp.id,
          store,
          placement: getDefaultPlacement(),
        };
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

  // Reorder the open-tab set: move `activeId` to `overId`'s position. Pure array
  // reordering — focus and store liveness are untouched (the focused tabId keeps
  // its identity, just changes index). Persists the new order via the unchanged
  // sessionStorage serializer (array order is the source of truth).
  const moveTab = useCallback(
    (activeId: string, overId: string) => {
      const prev = tabsRef.current;
      const from = prev.findIndex((t) => t.tabId === activeId);
      const to = prev.findIndex((t) => t.tabId === overId);
      if (from < 0 || to < 0 || from === to) return;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      tabsRef.current = next;
      setTabs(next);
      persist();
    },
    [persist],
  );

  // Set a tab's placement. Pure per-tab state — no focus/liveness change, so the
  // surface plugin re-positions the still-mounted tab (Chrome-style: no reload).
  const setPlacement = useCallback(
    (tabId: string, placement: Placement) => {
      const prev = tabsRef.current;
      const idx = prev.findIndex((t) => t.tabId === tabId);
      if (idx < 0 || prev[idx]!.placement === placement) return;
      const next = [...prev];
      next[idx] = { ...prev[idx]!, placement };
      tabsRef.current = next;
      setTabs(next);
      persist();
    },
    [persist],
  );

  const api = useMemo<TabsApi>(
    () => ({ tabs, focusedTabId, titles, setTabTitle, openTab, replaceTabApp, navigate, focusTab, closeTab, moveTab, setPlacement }),
    [tabs, focusedTabId, titles, setTabTitle, openTab, replaceTabApp, navigate, focusTab, closeTab, moveTab, setPlacement],
  );

  // Publish the focused tab's placement + a bound setter at module scope so
  // out-of-provider callers (floating-bar placement control, Esc shortcut) can
  // read and drive it. Mirrors the `setTabsNavigator` handle above.
  const focusedTabPlacement =
    tabs.find((t) => t.tabId === focusedTabId)?.placement ?? getDefaultPlacement();
  useEffect(() => {
    publishFocusedPlacement(focusedTabPlacement, (p) =>
      setPlacement(focusedRef.current, p),
    );
    return () => publishFocusedPlacement(getDefaultPlacement(), null);
  }, [focusedTabPlacement, setPlacement]);

  return <TabsContext.Provider value={api}>{children}</TabsContext.Provider>;
}
