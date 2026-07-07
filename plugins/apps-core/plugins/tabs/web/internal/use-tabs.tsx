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
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import {
  createPaneStore,
  parseUrl,
  setLiveStore,
  type PaneSlot,
  type PaneStore,
} from "@plugins/primitives/plugins/pane/web";
import { setFocusedSurfaceId } from "@plugins/primitives/plugins/shortcuts/web";
import { type Placement } from "@plugins/apps-core/core";
import {
  Apps,
  useActiveApp,
  defaultApp,
  resolveAppForPath,
} from "@plugins/apps-core/web";
import {
  getDefaultPlacement,
  usePlacementCapabilities,
} from "./placement-registry";
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
  /** The ONE surface rendering mode every tab is displayed under. */
  mode: Placement;
  /**
   * Switch the surface rendering mode (docked / windows / solo). Applies to the
   * whole surface at once — never a single tab — so the modes stay mutually
   * exclusive. Records the outgoing mode for {@link TabsApi.exitToPreviousMode}.
   */
  setMode(mode: Placement): void;
  /** Return to the mode in effect before the current one (solo's exit). */
  exitToPreviousMode(): void;
  /**
   * Always opens a NEW tab for `appId` (multi-instance) under the current
   * surface mode (in windows mode it becomes a new window; docked, a new tab).
   * Returns its tabId.
   */
  openTab(appId: string): string;
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

// Module-level mirror of the ONE per-surface rendering mode + its setters,
// mirroring the `tabsNavigator` pattern above. Lets out-of-provider callers (the
// floating action bar's mode control, the global Esc shortcut, the action-bar
// pin guard) read/drive the surface mode without the `useTabs` hook. A
// subscribable snapshot (useSurfaceMode) keeps those consumers reactive.
// eslint-disable-next-line scoped-store/no-module-mutable-store -- page-global by design: the ONE surface rendering mode, mirroring tabsNavigator/focusedSurfaceId. Driven by single global chrome (the floating-bar mode control + global Esc) outside any surface tree, so it cannot be a per-surface scoped store.
let surfaceMode: Placement = "";
let setSurfaceModeFn: ((mode: Placement) => void) | null = null;
let exitToPreviousModeFn: (() => void) | null = null;
const surfaceModeSubscribers = new Set<() => void>();

function publishSurfaceMode(
  mode: Placement,
  setter: ((mode: Placement) => void) | null,
  exit: (() => void) | null,
): void {
  setSurfaceModeFn = setter;
  exitToPreviousModeFn = exit;
  if (mode !== surfaceMode) {
    surfaceMode = mode;
    for (const fn of surfaceModeSubscribers) fn();
  }
}

/**
 * Imperatively set the surface rendering mode from anywhere — the persistent
 * home for the mode control on the floating action bar, the fullscreen button,
 * and the pin guard. No-op (rather than throw) before the provider mounts: a
 * stray keystroke/click pre-mount is benign, not a bug.
 */
export function setSurfaceMode(mode: Placement): void {
  setSurfaceModeFn?.(mode);
}

/**
 * Return the surface to the mode it was in before the current one — the solo
 * (fullscreen) exit affordance. Soloing from a window returns to windows mode;
 * soloing from docked returns to docked. No-op before the provider mounts.
 */
export function exitToPreviousMode(): void {
  exitToPreviousModeFn?.();
}

/**
 * Non-hook read of the surface mode — for plain-function callers (e.g. a
 * shortcut `when`/`handler` guard) that can't use the hook form.
 */
export function getSurfaceMode(): Placement {
  return surfaceMode;
}

/**
 * Reactive read of the surface mode, callable outside `<TabsProvider>`. Backs
 * the floating-bar mode control, the solo exit, and the chrome theme scope.
 */
export function useSurfaceMode(): Placement {
  return useSyncExternalStore(
    (cb) => {
      surfaceModeSubscribers.add(cb);
      return () => surfaceModeSubscribers.delete(cb);
    },
    () => surfaceMode,
    () => surfaceMode,
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
  };
}

interface BootState {
  tabs: Tab[];
  focusedTabId: string;
  /** Restored surface mode (registry default until `surface` registers). */
  mode: Placement;
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

  // Restore the persisted surface mode, or fall back to the registry default
  // (which is "" until `surface` registers). The provider resolves this raw
  // value against the registry on every render (see the `mode` derivation in
  // TabsProvider), so a pre-registration "" seed never leaks to consumers.
  const mode = persisted?.mode ?? getDefaultPlacement();

  return { tabs, focusedTabId: focused.tabId, mode };
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
  const appsRef = useLatestRef(apps);

  const [{ tabs: initialTabs, focusedTabId: initialFocus, mode: initialMode }] =
    useState(() =>
      bootTabs(apps, initialApp?.id ?? defaultApp(apps)?.id ?? ""),
    );
  const [tabs, setTabs] = useState<Tab[]>(initialTabs);
  const [focusedTabId, setFocusedTabId] = useState<string>(initialFocus);
  // The ONE surface rendering mode (docked / windows / solo). Per-surface, never
  // per-tab: every tab is displayed under this single value, so two modes can
  // never be visible at once. `previousMode` backs the solo (fullscreen) exit.
  const [rawMode, setModeState] = useState<Placement>(initialMode);
  const previousModeRef = useRef<Placement>(initialMode);
  // Resolve the stored mode against the placement registry: `""` (the boot seed
  // when the surface hasn't registered yet) and a stale id (a removed placement
  // sub-plugin) both resolve to the registered default — the same resolution
  // SurfaceBody applies at render. Publishing the RESOLVED mode is what keeps
  // every consumer (chrome theme scope, the mode control's highlight, the
  // persisted payload) agreeing with what the surface actually paints; before
  // this, a cold boot published `""` forever and the rail/tab bar dropped the
  // focused app's theme while the docked tab kept it.
  const capabilities = usePlacementCapabilities();
  const mode =
    capabilities !== null && !capabilities.ids.has(rawMode)
      ? capabilities.defaultId
      : rawMode;
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
  // HYBRID, not useLatestRef: these are ALSO written authoritatively inside the
  // action callbacks (tabsRef.current = nextTabs / focusedRef.current = tabId in
  // focusTab/openTab/closeTab/moveTab/setMode/replaceTabAppWithRoute) so a
  // callback's mutation is visible to the next callback in the SAME tick before
  // React re-renders. A useLatestRef render-sync would clobber those in-flight
  // writes on the next render, so the render-sync stays explicit and documented.
  const tabsRef = useRef(tabs);
  // eslint-disable-next-line react-hooks/refs -- intentional render-sync of a hybrid ref also written imperatively inside the action callbacks; see the note above.
  tabsRef.current = tabs;
  const focusedRef = useRef(focusedTabId);
  // eslint-disable-next-line react-hooks/refs -- intentional render-sync of a hybrid ref also written imperatively inside the action callbacks; see the note above.
  focusedRef.current = focusedTabId;
  // Hybrid ref (also written imperatively in setMode) so persist() reads the
  // latest surface mode in the same tick a mode change fires.
  const modeRef = useRef(mode);
  // eslint-disable-next-line react-hooks/refs -- intentional render-sync of a hybrid ref also written imperatively inside setMode; see the note above.
  modeRef.current = mode;

  const persist = useCallback(() => {
    savePersistedTabs(tabsRef.current, focusedRef.current, modeRef.current);
  }, []);

  // One-time: point the imperative live store at the initially-focused tab's
  // store. (bootTabs already created it `live`; this wires the module pointer.)
  const wiredRef = useRef(false);
  // eslint-disable-next-line react-hooks/refs -- intentional run-once guard read+written during render: wires the module-level live-store pointer to the initially-focused tab exactly once on mount (a one-shot init, not a latest-value sync).
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
   * Open a new tab for `appId` at its index. Used by the `+` new-tab button; the
   * new tab is displayed under the current surface mode (a new window in windows
   * mode, a docked tab otherwise) — the surface owns the mode, not the tab.
   */
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

  // Swap a tab's app in place (keeps the tabId + position), seeding `route` into
  // the fresh store before it goes live. The launcher (Home) tab and the rail
  // navigate INTO the picked app instead of spawning a tab beside it; a
  // cross-app deep-link lands the focused tab directly on its target route.
  const replaceTabAppWithRoute = useCallback(
    (tabId: string, appId: string, route: PaneSlot[]) => {
      const idx = tabsRef.current.findIndex((t) => t.tabId === tabId);
      if (idx < 0) return;
      tabsRef.current[idx]!.store.live = false;
      const store = makeBackgroundStore(appId, appsRef.current);
      const tab: Tab = { tabId, appId, store };
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

  // Switch the ONE surface rendering mode. Records the outgoing mode so solo's
  // exit can pop back to it. Pure surface state — no tab/focus/liveness change,
  // so the surface re-renders every (still-mounted) tab under the new mode with
  // no reload (Chrome-style keep-alive).
  const setMode = useCallback(
    (next: Placement) => {
      if (modeRef.current === next) return;
      previousModeRef.current = modeRef.current;
      modeRef.current = next;
      setModeState(next);
      persist();
    },
    [persist],
  );

  // Return to the mode in effect before the current one (solo's exit). Falls
  // back to the registry default if the previous mode is unknown or equals the
  // current (defensive: never leave the surface stuck in solo).
  const exitToPreviousMode = useCallback(() => {
    const prev = previousModeRef.current;
    setMode(prev && prev !== modeRef.current ? prev : getDefaultPlacement());
  }, [setMode]);

  const api = useMemo<TabsApi>(
    () => ({ tabs, focusedTabId, titles, mode, setMode, exitToPreviousMode, setTabTitle, openTab, replaceTabApp, navigate, focusTab, closeTab, moveTab }),
    [tabs, focusedTabId, titles, mode, setMode, exitToPreviousMode, setTabTitle, openTab, replaceTabApp, navigate, focusTab, closeTab, moveTab],
  );

  // Publish the surface mode + bound setters at module scope so out-of-provider
  // callers (floating-bar mode control, Esc shortcut, pin guard) can read and
  // drive it. Mirrors the `setTabsNavigator` handle above.
  useEffect(() => {
    publishSurfaceMode(mode, setMode, exitToPreviousMode);
    return () => publishSurfaceMode(getDefaultPlacement(), null, null);
  }, [mode, setMode, exitToPreviousMode]);

  return <TabsContext.Provider value={api}>{children}</TabsContext.Provider>;
}
