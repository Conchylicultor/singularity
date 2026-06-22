import type * as parcel from "@parcel/watcher";
import { extname } from "node:path";

// `@parcel/watcher` is loaded LAZILY (dynamic import inside createFileWatcher),
// never at module top-level. It pulls in a native `.node` addon that a static
// import would evaluate the instant ANY module transitively imports this file —
// including barrels (e.g. config_v2/server) that merely re-export an unrelated
// symbol. In a `bun build`/`--compile` bundle that native load throws (addons
// aren't bundleable), and the throw aborts the importing barrel's module-init
// PART-WAY, leaving its other exports (e.g. `ConfigV2`) undefined — which then
// surfaces far away as "ConfigV2.Register is undefined". Deferring the load to
// the point a watcher is actually started keeps the import side-effect-free, so
// a release that never starts a watcher never touches the addon, and one that
// does fails loudly at the call site (not during an unrelated barrel's init).
let parcelWatcherPromise: Promise<typeof import("@parcel/watcher")> | null =
  null;
function loadParcelWatcher(): Promise<typeof import("@parcel/watcher")> {
  parcelWatcherPromise ??= import("@parcel/watcher");
  return parcelWatcherPromise;
}

export interface FileWatcherOptions {
  dirs: string[];
  onChange: (events: parcel.Event[]) => void;
  onReconcile?: () => void;
  debounceMs?: number;
  ceilingMs?: number;
  reconcileMs?: number | null;
  extensions?: string[];
  ignore?: string[];
}

export interface FileWatcher {
  stop(): Promise<void>;
}

export async function createFileWatcher(
  opts: FileWatcherOptions,
): Promise<FileWatcher> {
  const {
    dirs,
    onChange,
    onReconcile,
    debounceMs = 100,
    ceilingMs = 1000,
    reconcileMs = 30_000,
    extensions,
    ignore,
  } = opts;

  const subscriptions: parcel.AsyncSubscription[] = [];
  let pending: parcel.Event[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let ceilingTimer: ReturnType<typeof setTimeout> | null = null;
  let lastFlushAt = 0;
  let reconcileTimer: ReturnType<typeof setInterval> | null = null;

  function flush(): void {
    lastFlushAt = Date.now();
    if (ceilingTimer) {
      clearTimeout(ceilingTimer);
      ceilingTimer = null;
    }
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    const events = pending;
    pending = [];
    onChange(events);
  }

  function schedule(): void {
    if (debounceTimer) return;
    const since = Date.now() - lastFlushAt;
    const delay =
      since >= ceilingMs
        ? debounceMs
        : Math.min(debounceMs, ceilingMs - since);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      flush();
    }, delay);

    if (!ceilingTimer) {
      ceilingTimer = setTimeout(() => {
        ceilingTimer = null;
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
          flush();
        }
      }, ceilingMs);
    }
  }

  const parcelOptions = ignore ? { ignore } : undefined;

  const parcelWatcher = await loadParcelWatcher();

  for (const dir of dirs) {
    try {
      const sub = await parcelWatcher.subscribe(
        dir,
        (err, events) => {
          if (err) {
            console.error(`[file-watcher] error on ${dir}`, err);
            return;
          }
          const filtered = extensions
            ? events.filter((e) => extensions.includes(extname(e.path)))
            : events;
          if (filtered.length === 0) return;

          if (debounceMs === 0) {
            onChange(filtered);
          } else {
            pending.push(...filtered);
            schedule();
          }
        },
        parcelOptions,
      );
      subscriptions.push(sub);
    } catch (err: unknown) {
      console.error(`[file-watcher] failed to subscribe to ${dir}`, err);
      throw err;
    }
  }

  if (reconcileMs != null) {
    reconcileTimer = setInterval(() => {
      if (onReconcile) {
        onReconcile();
      } else {
        onChange([]);
      }
    }, reconcileMs);
  }

  return {
    async stop(): Promise<void> {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (ceilingTimer) {
        clearTimeout(ceilingTimer);
        ceilingTimer = null;
      }
      if (reconcileTimer) {
        clearInterval(reconcileTimer);
        reconcileTimer = null;
      }
      pending = [];
      await Promise.all(subscriptions.map((s) => s.unsubscribe()));
      subscriptions.length = 0;
    },
  };
}
