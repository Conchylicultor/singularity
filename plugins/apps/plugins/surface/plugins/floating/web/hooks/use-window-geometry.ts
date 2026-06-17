import { useCallback, useSyncExternalStore } from "react";
import { getTabId } from "@plugins/primitives/plugins/tab-id/web";

/** A window's free-floating box on the desktop, plus its chrome state. */
export interface Geometry {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Stacking order; bumped to `++nextZ` on focus so the focused window wins. */
  z: number;
  minimized: boolean;
  maximized: boolean;
  /** Pre-maximize box, restored when maximize is toggled off. */
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

// Monotonic z-order counter. New windows / raise-to-front set `z = ++nextZ` so
// the most recently focused window always sits on top. Seeded past any hydrated
// z below. Bounded by renormalization (see `Z_CEILING` / `renormalize`).
let nextZ = 0;

/**
 * Ceiling for the committed window z. Once `nextZ` exceeds it we renormalize the
 * open windows down to compact ranks (`1..N`), so window z stays <= this and the
 * dock (z-overlay = 40) always sits above the windows — and the counter never
 * grows unbounded across a long session.
 */
const Z_CEILING = 30;

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
 * Compact every open window's z to a dense rank (`1..N`, N = window count) by
 * current z ascending, so the highest-z window (just bumped by the caller) stays
 * on top while the ceiling is respected. Mutates `geoState` only — the calling
 * mint site already runs `persist()`/`notify()`, so this never notifies itself.
 */
function renormalize() {
  const ranked = [...geoState.entries()].sort((a, b) => a[1].z - b[1].z);
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
      geoState.set(id, geo);
      if (geo.z > nextZ) nextZ = geo.z;
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
    minimized: false,
    maximized: false,
  };
}

function read(tabId: string): Geometry {
  hydrate();
  if (!geoState.has(tabId)) {
    geoState.set(tabId, defaultGeometry());
    // A freshly opened window mints `z = ++nextZ` (highest); if that crossed the
    // ceiling, renormalize keeps it on top while bounding z. Refresh the snapshot
    // so the new window appears in `useWindowGeometryMap` before any notify.
    if (nextZ > Z_CEILING) renormalize();
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
 * Raise a window's z above all others (module-level so the dock can call it
 * without a geometry handle). No-op when already on top. After minting the new
 * z, renormalize when over the ceiling — this compacts z by current value, so
 * the just-bumped window (now the highest) still ends up at rank N = top.
 */
export function bringWindowToFront(tabId: string) {
  const current = read(tabId);
  if (current.z === nextZ) return; // already on top
  geoState.set(tabId, { ...current, z: ++nextZ });
  if (nextZ > Z_CEILING) renormalize();
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
