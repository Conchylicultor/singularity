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

// Per-window geometry, mirroring `use-column-widths.ts`: a module-global Map
// keyed by tabId + a subscriber Set fed into `useSyncExternalStore`, so every
// floating window reading the same tabId stays in sync and survives remounts.
const geoState = new Map<string, Geometry>();
const subscribers = new Set<() => void>();

// Monotonic z-order counter. New windows / raise-to-front set `z = ++nextZ` to
// float above their tier-mates, then {@link reorder} compacts the open windows
// back to dense, tier-ordered ranks — so the counter never grows unbounded and
// the committed z stays `<= N` (the dock's z-overlay always sits above windows).
let nextZ = 0;

/**
 * The reactive whole-map snapshot returned by {@link useWindowGeometryMap}. It is
 * a STABLE reference between mutations (rebuilt only in {@link notify} and after
 * inserts) so `useSyncExternalStore`'s `getSnapshot` never reports a phantom
 * change and loops.
 */
// eslint-disable-next-line scoped-store/no-module-mutable-store -- page-global by design: a derived cache of the page-global `geoState` (window geometry is keyed by tabId and shared across every keep-alive surface mount, never per-surface), mirroring the module-global store this file already is.
let snapshot: Map<string, Geometry> = new Map();

function rebuildSnapshot() {
  snapshot = new Map(geoState);
}

function notify() {
  rebuildSnapshot();
  for (const fn of subscribers) fn();
}

/**
 * Re-rank every open window to a dense `1..N` z-order with the two-tier invariant
 * baked in: unpinned windows take the low ranks, pinned ("always on top") windows
 * the high ranks, and within each tier the existing z order (focus recency) is
 * preserved. The just-bumped window (highest z in its tier) therefore lands on top
 * of its tier. Enforcing pinned-above-unpinned here — rather than via a render-time
 * z offset — keeps the committed z `<= N`, so the dock overlay (z-overlay) always
 * sits above the windows. Mutates `geoState` only; the calling mint site runs
 * `persist()`/`notify()`, so this never notifies itself.
 */
function reorder() {
  const ranked = [...geoState.entries()].sort((a, b) => {
    const pinDelta = Number(a[1].pinned) - Number(b[1].pinned);
    return pinDelta !== 0 ? pinDelta : a[1].z - b[1].z;
  });
  ranked.forEach(([id, geo], i) => geoState.set(id, { ...geo, z: i + 1 }));
  nextZ = ranked.length;
}

const LS_KEY = () => `app-windows:${getTabId()}`;

/** Whole-map serialization to sessionStorage (per browser tab, like PersistedTabs). */
function persist() {
  if (typeof window === "undefined") return;
  try {
    const record: Record<string, Geometry> = {};
    for (const [id, geo] of geoState) record[id] = geo;
    sessionStorage.setItem(LS_KEY(), JSON.stringify(record));
  } catch (err) {
    if (!(err instanceof DOMException)) throw err;
  }
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
    const record = JSON.parse(raw) as Record<string, Geometry>;
    for (const [id, geo] of Object.entries(record)) {
      // Migrate the legacy `maximized` boolean (older persisted sessions) to the
      // unified `snap` field so a refresh never crashes on a stale shape.
      const legacy = geo as Geometry & { maximized?: boolean };
      const normalized: Geometry = {
        ...geo,
        // Default the always-on-top flag for sessions persisted before pinning.
        pinned: geo.pinned ?? false,
        snap: geo.snap ?? (legacy.maximized ? "maximize" : null),
      };
      delete (normalized as { maximized?: boolean }).maximized;
      geoState.set(id, normalized);
      if (normalized.z > nextZ) nextZ = normalized.z;
    }
    rebuildSnapshot();
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
  const n = geoState.size;
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

function read(tabId: string): Geometry {
  hydrate();
  if (!geoState.has(tabId)) {
    geoState.set(tabId, defaultGeometry());
    // A freshly opened (unpinned) window mints `z = ++nextZ` (highest); reorder
    // then settles it onto the top of the unpinned tier — below any always-on-top
    // window — while keeping z dense. Refresh the snapshot so the new window
    // appears in `useWindowGeometryMap` before any notify.
    reorder();
    persist();
    rebuildSnapshot();
  }
  return geoState.get(tabId)!;
}

type GeometryUpdater = Geometry | ((g: Geometry) => Geometry);

/**
 * Drop geometry for windows whose tab is no longer open, so a closed window's
 * box doesn't linger in the map (and re-appear if a new window reuses its slot).
 * Called from `SurfaceBody` keyed on the current open-tab id set.
 */
export function pruneWindowGeometry(openTabIds: Set<string>) {
  let changed = false;
  for (const id of geoState.keys()) {
    if (!openTabIds.has(id)) {
      geoState.delete(id);
      changed = true;
    }
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
export function bringWindowToFront(tabId: string) {
  const current = read(tabId);
  // Topmost in its tier already? Every same-tier window sits at or below it.
  const topOfTier = [...geoState.values()].every(
    (g) => g.pinned !== current.pinned || g.z <= current.z,
  );
  if (topOfTier) return;
  geoState.set(tabId, { ...current, z: ++nextZ });
  reorder();
  persist();
  notify();
}

/**
 * Toggle a window's "always on top" flag (module-level so chrome / shortcuts can
 * call it without a geometry handle). Bumps the window so it lands on top of its
 * NEW tier, then {@link reorder} re-ranks so pinned windows sit above unpinned ones.
 */
export function toggleWindowPin(tabId: string) {
  const current = read(tabId);
  geoState.set(tabId, { ...current, pinned: !current.pinned, z: ++nextZ });
  reorder();
  persist();
  notify();
}

/**
 * Set a window's `minimized` flag (default un-minimize). Module-level so the dock
 * can restore/minimize a window without a geometry handle. No-op when unchanged
 * so it never notifies spuriously.
 */
export function restoreWindow(tabId: string, minimize = false) {
  const current = read(tabId);
  if (current.minimized === minimize) return;
  geoState.set(tabId, { ...current, minimized: minimize });
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
export function snapWindowDirection(tabId: string, dir: SnapDirection) {
  const current = read(tabId);
  const action = nextSnapAction(current.snap, dir);
  if (action.type === "minimize") {
    restoreWindow(tabId, /* minimize */ true);
    return;
  }
  const { zone } = action;
  const next: Geometry =
    zone === null
      ? // Restore to the stashed free box (matching the chrome's maximize toggle).
        {
          ...current,
          snap: null,
          ...(current.restore ?? {}),
          restore: undefined,
          minimized: false,
        }
      : {
          ...current,
          snap: zone,
          // Keep an existing free box; only capture one when leaving the free state.
          restore:
            current.restore ?? {
              x: current.x,
              y: current.y,
              w: current.w,
              h: current.h,
            },
          minimized: false,
        };
  geoState.set(tabId, next);
  persist();
  notify();
  if (current.minimized) bringWindowToFront(tabId);
}

/**
 * Reactive read of the whole geometry map (for the dock). Returns the module
 * snapshot — a stable reference between mutations (rebuilt only in `notify` and
 * after inserts), so `useSyncExternalStore` never sees a phantom change.
 */
export function useWindowGeometryMap(): Map<string, Geometry> {
  return useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    () => snapshot,
    () => snapshot,
  );
}

/**
 * Per-window geometry handle, mirroring `useColumnWidth`: `[geo, setGeo,
 * bringToFront]`. `setGeo` accepts a value or a functional updater; every
 * mutation persists the whole map and notifies subscribers. `bringToFront`
 * delegates to the module-level {@link bringWindowToFront} so there is one
 * implementation shared with the dock.
 */
export function useWindowGeometry(
  tabId: string,
): [Geometry, (next: GeometryUpdater) => void, () => void] {
  const geo = useSyncExternalStore(
    (cb) => {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
    () => read(tabId),
    () => read(tabId),
  );

  // Stable callbacks (keyed only on tabId): consumers push these into effect deps
  // / state, so an unstable identity per render would loop. A store handle must
  // return steady references.
  const setGeo = useCallback(
    (next: GeometryUpdater) => {
      const current = read(tabId);
      const value = typeof next === "function" ? next(current) : next;
      if (value === current) return;
      geoState.set(tabId, value);
      persist();
      notify();
    },
    [tabId],
  );

  const bringToFront = useCallback(() => bringWindowToFront(tabId), [tabId]);

  return [geo, setGeo, bringToFront];
}
