import { useSyncExternalStore } from "react";
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
// `WindowFrame` reading the same tabId stays in sync and survives remounts.
const geoState = new Map<string, Geometry>();
const subscribers = new Set<() => void>();

// Monotonic z-order counter. `bringToFront` sets `z = ++nextZ` so the most
// recently focused window always sits on top. Seeded past any hydrated z below.
let nextZ = 0;

function notify() {
  for (const fn of subscribers) fn();
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
    persist();
  }
  return geoState.get(tabId)!;
}

type GeometryUpdater = Geometry | ((g: Geometry) => Geometry);

/**
 * Drop geometry for windows whose tab is no longer open, so a closed window's
 * box doesn't linger in the map (and re-appear if a new window reuses its slot).
 * Called from `AppWindowsBody` keyed on the current open-tab id set.
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
 * Per-window geometry handle, mirroring `useColumnWidth`: `[geo, setGeo,
 * bringToFront]`. `setGeo` accepts a value or a functional updater; every
 * mutation persists the whole map and notifies subscribers. `bringToFront`
 * raises this window's z above all others.
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

  const setGeo = (next: GeometryUpdater) => {
    const current = read(tabId);
    const value = typeof next === "function" ? next(current) : next;
    if (value === current) return;
    geoState.set(tabId, value);
    persist();
    notify();
  };

  const bringToFront = () => {
    const current = read(tabId);
    if (current.z === nextZ) return; // already on top
    geoState.set(tabId, { ...current, z: ++nextZ });
    persist();
    notify();
  };

  return [geo, setGeo, bringToFront];
}
