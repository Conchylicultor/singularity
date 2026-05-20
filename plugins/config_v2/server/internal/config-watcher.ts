import { mkdir } from "node:fs/promises";
import * as parcel from "@parcel/watcher";
import { CONFIG_DIR } from "@plugins/infra/plugins/paths/server";
import type { Disposable } from "../../core";

const DEBOUNCE_MS = 100;
const CEILING_MS = 1000;
const RECONCILE_MS = 30_000;

const watchers = new Map<string, Set<() => void>>();
let subscription: parcel.AsyncSubscription | null = null;
let reconcileTimer: ReturnType<typeof setInterval> | null = null;
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const ceilingTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lastNotify = new Map<string, number>();

function scheduleNotify(abs: string): void {
  if (debounceTimers.has(abs)) return;

  const since = Date.now() - (lastNotify.get(abs) ?? 0);
  const delay = since >= CEILING_MS ? DEBOUNCE_MS : Math.min(DEBOUNCE_MS, CEILING_MS - since);

  debounceTimers.set(abs, setTimeout(() => {
    debounceTimers.delete(abs);
    fireNotify(abs);
  }, delay));

  if (!ceilingTimers.has(abs)) {
    ceilingTimers.set(abs, setTimeout(() => {
      ceilingTimers.delete(abs);
      if (debounceTimers.has(abs)) {
        clearTimeout(debounceTimers.get(abs)!);
        debounceTimers.delete(abs);
        fireNotify(abs);
      }
    }, CEILING_MS));
  }
}

function fireNotify(abs: string): void {
  lastNotify.set(abs, Date.now());
  const ceilingTimer = ceilingTimers.get(abs);
  if (ceilingTimer) {
    clearTimeout(ceilingTimer);
    ceilingTimers.delete(abs);
  }

  const cbs = watchers.get(abs);
  if (!cbs || cbs.size === 0) return;
  for (const cb of cbs) cb();
}

export async function initConfigWatcher(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });

  subscription = await parcel.subscribe(CONFIG_DIR, (err, events) => {
    if (err) {
      console.error("[config-watcher] watcher error:", err);
      return;
    }
    for (const event of events) {
      if (!event.path.endsWith(".jsonc")) continue;
      if (watchers.has(event.path)) {
        scheduleNotify(event.path);
      }
    }
  });

  reconcileTimer = setInterval(() => {
    for (const abs of watchers.keys()) {
      fireNotify(abs);
    }
  }, RECONCILE_MS);
}

export async function shutdownConfigWatcher(): Promise<void> {
  if (reconcileTimer) {
    clearInterval(reconcileTimer);
    reconcileTimer = null;
  }
  for (const t of debounceTimers.values()) clearTimeout(t);
  for (const t of ceilingTimers.values()) clearTimeout(t);
  debounceTimers.clear();
  ceilingTimers.clear();
  lastNotify.clear();
  if (subscription) {
    await subscription.unsubscribe();
    subscription = null;
  }
}

export function watchFileChange(absPath: string, cb: () => void): Disposable {
  let cbs = watchers.get(absPath);
  if (!cbs) {
    cbs = new Set();
    watchers.set(absPath, cbs);
  }
  cbs.add(cb);

  return {
    dispose: () => {
      cbs!.delete(cb);
      if (cbs!.size === 0) {
        watchers.delete(absPath);
      }
    },
  };
}
