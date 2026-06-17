import { useCallback, useSyncExternalStore } from "react";
import { getTabId } from "@plugins/primitives/plugins/tab-id/web";
import { nextSnapAction, type SnapDirection, type SnapZone } from "./use-snap";

/** A window's free-floating box on the desktop, plus its chrome state. */
export interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
  /**
   * Stacking order, kept dense (`1..N`) and tier-ordered by {@link reorder}:
   * pinned windows always rank above unpinned ones, and within a tier the most
   * recently focused window wins. Applied verbatim as the container `zIndex`.
   */
  z: number;
  /**
   * "Always on top": when set, the window ranks above every unpinned window
   * regardless of focus order (enforced in {@link reorder}, not at render, so the
   * committed z stays `<= N` and the dock overlay always sits above the windows).
   */
  pinned: boolean;
  minimized: boolean;
  /**
   * The window's snap state: a half/quarter tile, `"maximize"` (full), or null
   * when free-floating at {@link Geometry.x}/y/w/h. When set, the box is derived
   * from `snapBox(snap)` (resolution-independent) and resize handles are hidden.
   */
  snap: SnapZone | null;
  /** Pre-snap free box, restored when a snapped/maximized window is dragged out or toggled back. */
  restore?: { x: number; y: number; w: number; h: number };
}

/** Stable identity for a floating window (its own monotonic id, not a tabId). */
export type WindowId = string;

/**
 * A floating **window** — the geometry-owning unit. A window holds an ordered
 * list of member tabIds (the tab-strip order) and the one `activeTabId` it
 * currently shows; every other member stays mounted but hidden. By default each
 * floating tab is its own singleton window, so the un-grouped behaviour is
 * byte-identical to the per-tab geometry store this file replaces.
 */
export interface FloatingWindow {
  id: WindowId;
  /** Ordered member tabIds = tab-strip order. */
  members: string[];
  /** The shown member; every other member is mounted-but-hidden. */
  activeTabId: string;
  geo: Geometry;
}

/** Minimum draggable box so a window can never be resized into nothing. */
export const MIN_W = 320;
export const MIN_H = 200;

/** The desktop backdrop's inner box a window is clamped within. */
export interface Bounds {
  width: number;
  height: number;
}

/**
 * The minimum slice of a window kept on-screen so its titlebar is always
 * grabbable back. A window may hang off the left/right/bottom edges down to this
 * sliver; the top is the exception (pinned to 0) since the titlebar lives there.
 */
export const MIN_VISIBLE = 48;

/**
 * Pin a window's origin so its titlebar stays reachable (macOS-style): the box
 * may extend past the left, right, and bottom edges, but always keeps
 * {@link MIN_VISIBLE}px on-screen so the titlebar can be grabbed back. The top is
 * floored at 0 — the titlebar sits at the window's top, so a negative `y` would
 * slide it above the surface where it can't be grabbed. Returns `g` unchanged
 * when already in range so `setGeo`'s identity guard can skip the notify.
 */
export function clampToBounds(g: Geometry, bounds: Bounds): Geometry {
  const x = Math.min(Math.max(MIN_VISIBLE - g.w, g.x), bounds.width - MIN_VISIBLE);
  const y = Math.min(Math.max(0, g.y), Math.max(0, bounds.height - MIN_VISIBLE));
  if (x === g.x && y === g.y) return g;
  return { ...g, x, y };
}

// Per-window state, mirroring the old per-tab geometry store: a module-global
// Map keyed by windowId + a subscriber Set fed into `useSyncExternalStore`, so
// every floating surface reading the same window stays in sync and survives
// remounts. `tabToWindow` is a derived reverse index (tabId → windowId), rebuilt
// from every window's `members` whenever the windows mutate.
// eslint-disable-next-line scoped-store/no-module-mutable-store -- page-global by design: floating windows own geometry shared across every keep-alive surface mount (never per-surface), mirroring the module-global geometry store this file replaces.
const windows = new Map<WindowId, FloatingWindow>();
// eslint-disable-next-line scoped-store/no-module-mutable-store -- page-global by design: a derived reverse index of the page-global `windows` map, rebuilt on every mutation.
const tabToWindow = new Map<string, WindowId>();
const subscribers = new Set<() => void>();

/** Monotonic window-id counter (deterministic, avoids crypto in this module). */
let nextWindowId = 0;
function mintWindowId(): WindowId {
  return `w${++nextWindowId}`;
}

/**
 * Windows freshly *minted* this session (a new floating tab, a tear-off split) —
 * NOT hydrated from a prior session or formed by a merge. The chrome consumes the
 * flag once via {@link consumeWindowIntro} to play the window's open animation
 * exactly when it first materializes on the desktop, never on a refresh or a
 * placement round-trip.
 */
// eslint-disable-next-line scoped-store/no-module-mutable-store -- page-global by design: a one-shot set of just-opened window ids, consumed once by the chrome (mirrors this plugin's module-global geometry store).
const introIds = new Set<WindowId>();

/** Consume (read-and-clear) a window's pending open-animation flag. */
export function consumeWindowIntro(id: WindowId): boolean {
  if (!introIds.has(id)) return false;
  introIds.delete(id);
  return true;
}

// Monotonic z-order counter. New windows / raise-to-front set `z = ++nextZ` to
// float above their tier-mates, then {@link reorder} compacts the open windows
// back to dense, tier-ordered ranks — so the counter never grows unbounded and
// the committed z stays `<= N` (the dock's z-overlay always sits above windows).
let nextZ = 0;

/** Rebuild the tabId → windowId reverse index from the live windows map. */
function rebuildTabIndex() {
  tabToWindow.clear();
  for (const win of windows.values()) {
    for (const tabId of win.members) tabToWindow.set(tabId, win.id);
  }
}

/**
 * The reactive whole-map snapshot returned by {@link useFloatingWindows}. It is
 * a STABLE reference between mutations (rebuilt only in {@link notify} and after
 * inserts) so `useSyncExternalStore`'s `getSnapshot` never reports a phantom
 * change and loops.
 */
// eslint-disable-next-line scoped-store/no-module-mutable-store -- page-global by design: a derived cache of the page-global `windows` map (windows are keyed by windowId and shared across every keep-alive surface mount, never per-surface), mirroring the module-global store this file is.
let snapshot: Map<WindowId, FloatingWindow> = new Map();

function rebuildSnapshot() {
  snapshot = new Map(windows);
}

/** Recompute the reverse index + snapshot together (every structural mutation). */
function reindex() {
  rebuildTabIndex();
  rebuildSnapshot();
}

function notify() {
  reindex();
  for (const fn of subscribers) fn();
}

/**
 * Re-rank every open window to a dense `1..N` z-order with the two-tier invariant
 * baked in: unpinned windows take the low ranks, pinned ("always on top") windows
 * the high ranks, and within each tier the existing z order (focus recency) is
 * preserved. The just-bumped window (highest z in its tier) therefore lands on top
 * of its tier. Enforcing pinned-above-unpinned here — rather than via a render-time
 * z offset — keeps the committed z `<= N`, so the dock overlay (z-overlay) always
 * sits above the windows. Mutates `windows` only; the calling mint site runs
 * `persist()`/`notify()`, so this never notifies itself.
 */
function reorder() {
  const ranked = [...windows.values()].sort((a, b) => {
    const pinDelta = Number(a.geo.pinned) - Number(b.geo.pinned);
    return pinDelta !== 0 ? pinDelta : a.geo.z - b.geo.z;
  });
  ranked.forEach((win, i) =>
    windows.set(win.id, { ...win, geo: { ...win.geo, z: i + 1 } }),
  );
  nextZ = ranked.length;
}

const LS_KEY = () => `app-windows:${getTabId()}`;

/** The persisted shape of a window (drops nothing — members + active + geo). */
interface PersistedWindow {
  members: string[];
  activeTabId: string;
  geo: Geometry;
}

/** Whole-map serialization to sessionStorage (per browser tab, like PersistedTabs). */
function persist() {
  if (typeof window === "undefined") return;
  try {
    const record: Record<WindowId, PersistedWindow> = {};
    for (const [id, win] of windows)
      record[id] = {
        members: win.members,
        activeTabId: win.activeTabId,
        geo: win.geo,
      };
    sessionStorage.setItem(LS_KEY(), JSON.stringify(record));
  } catch (err) {
    if (!(err instanceof DOMException)) throw err;
  }
}

/**
 * Migrate the legacy `maximized` boolean (older persisted sessions) to the
 * unified `snap` field, and default the always-on-top flag, so a refresh never
 * crashes on a stale geometry shape.
 */
function normalizeGeo(geo: Geometry): Geometry {
  const legacy = geo as Geometry & { maximized?: boolean };
  const normalized: Geometry = {
    ...geo,
    pinned: geo.pinned ?? false,
    snap: geo.snap ?? (legacy.maximized ? "maximize" : null),
  };
  delete (normalized as { maximized?: boolean }).maximized;
  return normalized;
}

// Hydrate the whole map once on first read, so cascade defaults pick up from the
// persisted count and z-order resumes above the highest stored z.
let hydrated = false;
function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = sessionStorage.getItem(LS_KEY());
    if (!raw) return;
    const record = JSON.parse(raw) as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      // Legacy shape: `Record<tabId, Geometry>` (no `members` field) — wrap each
      // entry as a singleton window keyed by its own (legacy = tabId) key, so a
      // session persisted before window-grouping migrates losslessly.
      const entry = value as Partial<PersistedWindow> & Geometry;
      const win: FloatingWindow =
        entry.members === undefined
          ? {
              id: key,
              members: [key],
              activeTabId: key,
              geo: normalizeGeo(value as Geometry),
            }
          : {
              id: key,
              members: entry.members,
              activeTabId: entry.activeTabId ?? entry.members[0]!,
              geo: normalizeGeo(entry.geo as Geometry),
            };
      windows.set(win.id, win);
      if (win.geo.z > nextZ) nextZ = win.geo.z;
      // Keep the id counter ahead of any persisted `w<N>` id so fresh windows
      // never collide with a hydrated one.
      const m = /^w(\d+)$/.exec(win.id);
      if (m && Number(m[1]) > nextWindowId) nextWindowId = Number(m[1]);
    }
    reindex();
  } catch (err) {
    if (!(err instanceof DOMException)) throw err;
  }
}

/**
 * First access for an unknown window cascades it down-right from the prior ones
 * (`40 + n*28`) and assigns the next z, so freshly opened windows never land
 * exactly on top of an existing one.
 */
function defaultGeometry(): Geometry {
  const n = windows.size;
  return {
    x: 40 + n * 28,
    y: 40 + n * 28,
    w: 880,
    h: 600,
    z: ++nextZ,
    pinned: false,
    minimized: false,
    snap: null,
  };
}

/**
 * Resolve (auto-creating) the window holding `tabId`. On first read for an
 * unknown tab a singleton window is minted with a cascade default box, then
 * {@link reorder} settles it onto the top of the unpinned tier; the snapshot is
 * refreshed so the new window appears in {@link useFloatingWindows} before any
 * notify.
 */
function readWindowForTab(tabId: string): FloatingWindow {
  hydrate();
  const existing = tabToWindow.get(tabId);
  if (existing) return windows.get(existing)!;
  const id = mintWindowId();
  introIds.add(id);
  windows.set(id, {
    id,
    members: [tabId],
    activeTabId: tabId,
    geo: defaultGeometry(),
  });
  reorder();
  persist();
  reindex();
  return windows.get(id)!;
}

type GeometryUpdater = Geometry | ((g: Geometry) => Geometry);

/** Imperative resolver: which window currently holds `tabId` (commands / menu). */
export function windowForTab(tabId: string): WindowId | undefined {
  hydrate();
  return tabToWindow.get(tabId);
}

/** Imperative read of a window by id (commands / menu). */
export function getFloatingWindow(windowId: WindowId): FloatingWindow | undefined {
  hydrate();
  return windows.get(windowId);
}

/**
 * Detach `tabId` from its current window. If that window empties it is deleted;
 * otherwise its `activeTabId` is repaired to a surviving neighbour (preferring
 * the prior sibling, else the new first member). Pure structural mutation —
 * the caller persists + notifies. Returns the (possibly removed) source window's
 * id so callers can reason about cascading effects.
 */
function detachFromCurrent(tabId: string): WindowId | undefined {
  const sourceId = tabToWindow.get(tabId);
  if (!sourceId) return undefined;
  const source = windows.get(sourceId);
  if (!source) return sourceId;
  const idx = source.members.indexOf(tabId);
  const remaining = source.members.filter((m) => m !== tabId);
  if (remaining.length === 0) {
    windows.delete(sourceId);
    return sourceId;
  }
  // Repair the active member if we just removed it: take the prior sibling
  // (clamped) so focus lands on a neighbour, like closing a browser tab.
  const activeTabId =
    source.activeTabId === tabId
      ? remaining[Math.min(idx, remaining.length - 1)]!
      : source.activeTabId;
  windows.set(sourceId, { ...source, members: remaining, activeTabId });
  return sourceId;
}

/**
 * Move `tabId` into `targetWindowId` (its new tab strip), inserting at `atIndex`
 * (default end) and making it the shown member. Detaches it from its current
 * window first (deleting/repairing that window as needed), then raises the target
 * to the front so the merge result is focused. No-op when the tab is already the
 * sole member of the target at that position is not special-cased — re-inserting
 * is idempotent in effect.
 */
export function mergeTabIntoWindow(
  tabId: string,
  targetWindowId: WindowId,
  atIndex?: number,
) {
  hydrate();
  const target = windows.get(targetWindowId);
  if (!target) return;
  detachFromCurrent(tabId);
  // Re-read the target: detach may have repaired it (if tab came from it).
  const current = windows.get(targetWindowId);
  if (!current) return;
  const members = current.members.filter((m) => m !== tabId);
  const index = atIndex ?? members.length;
  members.splice(Math.max(0, Math.min(index, members.length)), 0, tabId);
  windows.set(targetWindowId, { ...current, members, activeTabId: tabId });
  // Persist + notify the structural change first; bringWindowToFront only
  // re-ranks z and is a no-op when the target is already topmost (e.g. when the
  // source window was just deleted, leaving the target alone) — so it can't be
  // relied on to flush this mutation.
  persist();
  notify();
  bringWindowToFront(targetWindowId);
}

/**
 * Tear `tabId` out of its current window into a fresh singleton window. When a
 * `point` is given the new window's box is placed there (clamped later by the
 * chrome); otherwise it cascades from the window count. The new window lands on
 * top. No-op when the tab is already the lone member of its window.
 */
export function splitTabToNewWindow(
  tabId: string,
  point?: { x: number; y: number },
) {
  hydrate();
  const sourceId = tabToWindow.get(tabId);
  const source = sourceId ? windows.get(sourceId) : undefined;
  // Already its own singleton window — nothing to split off.
  if (source && source.members.length === 1) return;
  detachFromCurrent(tabId);
  const id = mintWindowId();
  introIds.add(id);
  const geo = defaultGeometry();
  windows.set(id, {
    id,
    members: [tabId],
    activeTabId: tabId,
    geo: point ? { ...geo, x: point.x, y: point.y } : geo,
  });
  reorder();
  persist();
  notify();
}

/** Set a window's shown member (no-op when already active or not a member). */
export function setActiveMember(windowId: WindowId, tabId: string) {
  hydrate();
  const win = windows.get(windowId);
  if (!win || win.activeTabId === tabId || !win.members.includes(tabId)) return;
  windows.set(windowId, { ...win, activeTabId: tabId });
  persist();
  notify();
}

/** Reorder `tabId` to `atIndex` within its window's member strip (no-op if absent). */
export function reorderMember(windowId: WindowId, tabId: string, atIndex: number) {
  hydrate();
  const win = windows.get(windowId);
  if (!win) return;
  const from = win.members.indexOf(tabId);
  if (from === -1) return;
  const members = win.members.filter((m) => m !== tabId);
  members.splice(Math.max(0, Math.min(atIndex, members.length)), 0, tabId);
  windows.set(windowId, { ...win, members });
  persist();
  notify();
}

/**
 * Drop members whose tab is no longer open from every window, delete windows that
 * empty out, and repair a dropped `activeTabId` to the first survivor — so a
 * closed tab's window doesn't linger (and re-appear if a new tab reuses its
 * slot). Called from `FloatingChrome` keyed on the current open-tab id set.
 */
export function pruneWindows(openTabIds: Set<string>) {
  hydrate();
  let changed = false;
  for (const [id, win] of [...windows]) {
    const members = win.members.filter((m) => openTabIds.has(m));
    if (members.length === win.members.length) continue;
    changed = true;
    if (members.length === 0) {
      windows.delete(id);
      continue;
    }
    const activeTabId = members.includes(win.activeTabId)
      ? win.activeTabId
      : members[0]!;
    windows.set(id, { ...win, members, activeTabId });
  }
  if (changed) {
    persist();
    notify();
  }
}

/**
 * Raise a window to the top of its own tier (module-level so the dock can call it
 * without a geometry handle). A pinned window rises above other pinned windows; an
 * unpinned one rises above other unpinned windows but stays below any always-on-top
 * window. No-op when already topmost in its tier — so repeated pointer-downs inside
 * the focused window never churn the z-order. Mints the new z, then {@link reorder}
 * compacts back to dense, tier-ordered ranks with this window on top of its tier.
 */
export function bringWindowToFront(windowId: WindowId) {
  hydrate();
  const current = windows.get(windowId);
  if (!current) return;
  // Topmost in its tier already? Every same-tier window sits at or below it.
  const topOfTier = [...windows.values()].every(
    (w) => w.geo.pinned !== current.geo.pinned || w.geo.z <= current.geo.z,
  );
  if (topOfTier) return;
  windows.set(windowId, { ...current, geo: { ...current.geo, z: ++nextZ } });
  reorder();
  persist();
  notify();
}

/**
 * Toggle a window's "always on top" flag (module-level so chrome / shortcuts can
 * call it without a geometry handle). Bumps the window so it lands on top of its
 * NEW tier, then {@link reorder} re-ranks so pinned windows sit above unpinned ones.
 */
export function toggleWindowPin(windowId: WindowId) {
  hydrate();
  const current = windows.get(windowId);
  if (!current) return;
  windows.set(windowId, {
    ...current,
    geo: { ...current.geo, pinned: !current.geo.pinned, z: ++nextZ },
  });
  reorder();
  persist();
  notify();
}

/**
 * Set a window's `minimized` flag (default un-minimize). Module-level so the dock
 * can restore/minimize a window without a geometry handle. No-op when unchanged
 * so it never notifies spuriously.
 */
export function restoreWindow(windowId: WindowId, minimize = false) {
  hydrate();
  const current = windows.get(windowId);
  if (!current || current.geo.minimized === minimize) return;
  windows.set(windowId, {
    ...current,
    geo: { ...current.geo, minimized: minimize },
  });
  persist();
  notify();
}

/**
 * Apply a keyboard tiling nudge to a window (module-level so static
 * window-management shortcuts can drive the focused window without a geometry
 * handle). The {@link nextSnapAction} state machine turns the current snap +
 * direction into the next tile, a restore-to-free, or a minimize — mirroring the
 * zones the mouse drag produces. A snap always un-minimizes; nudging a minimized
 * window also raises it so it lands on top like a fresh focus.
 */
export function snapWindowDirection(windowId: WindowId, dir: SnapDirection) {
  hydrate();
  const current = windows.get(windowId);
  if (!current) return;
  const action = nextSnapAction(current.geo.snap, dir);
  if (action.type === "minimize") {
    restoreWindow(windowId, /* minimize */ true);
    return;
  }
  const { zone } = action;
  const geo = current.geo;
  const nextGeo: Geometry =
    zone === null
      ? // Restore to the stashed free box (matching the chrome's maximize toggle).
        {
          ...geo,
          snap: null,
          ...(geo.restore ?? {}),
          restore: undefined,
          minimized: false,
        }
      : {
          ...geo,
          snap: zone,
          // Keep an existing free box; only capture one when leaving the free state.
          restore:
            geo.restore ?? { x: geo.x, y: geo.y, w: geo.w, h: geo.h },
          minimized: false,
        };
  windows.set(windowId, { ...current, geo: nextGeo });
  persist();
  notify();
  if (geo.minimized) bringWindowToFront(windowId);
}

/**
 * Reactive read of the whole windows map (for the dock). Returns the module
 * snapshot — a stable reference between mutations (rebuilt only in `notify` and
 * after inserts), so `useSyncExternalStore` never sees a phantom change.
 */
export function useFloatingWindows(): Map<WindowId, FloatingWindow> {
  return useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    () => snapshot,
    () => snapshot,
  );
}

/** The reactive window handle a {@link useTabWindow} reader receives. */
export interface TabWindowHandle {
  /** The window currently holding this tab (auto-created on first read). */
  window: FloatingWindow;
  /** Whether this tab is the window's shown member. */
  isActive: boolean;
  /** Mutate this window's geometry box (value or functional updater). */
  setGeo: (next: GeometryUpdater) => void;
  /** Raise this window above its tier-mates. */
  bringToFront: () => void;
}

/**
 * Per-tab window handle, mirroring the old `useWindowGeometry`: resolves (and
 * auto-creates) the window holding `tabId`, exposing its geometry setter and a
 * raise-to-front. `isActive` is `window.activeTabId === tabId`, so an inactive
 * group member can hide itself while staying mounted. Every mutation persists the
 * whole map and notifies subscribers.
 */
export function useTabWindow(tabId: string): TabWindowHandle {
  const window = useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    () => readWindowForTab(tabId),
    () => readWindowForTab(tabId),
  );

  // Stable callbacks (keyed only on tabId): consumers push these into effect deps
  // / state, so an unstable identity per render would loop. A store handle must
  // return steady references. `setGeo` resolves the window by tab at call time, so
  // it stays correct even if the tab is later merged into a different window.
  const setGeo = useCallback(
    (next: GeometryUpdater) => {
      const win = readWindowForTab(tabId);
      const value = typeof next === "function" ? next(win.geo) : next;
      if (value === win.geo) return;
      windows.set(win.id, { ...win, geo: value });
      persist();
      notify();
    },
    [tabId],
  );

  const bringToFront = useCallback(() => {
    const id = tabToWindow.get(tabId);
    if (id) bringWindowToFront(id);
  }, [tabId]);

  return { window, isActive: window.activeTabId === tabId, setGeo, bringToFront };
}
