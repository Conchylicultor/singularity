import { mkdir } from "node:fs/promises";
import { createFileWatcher, type FileWatcher } from "@plugins/infra/plugins/file-watcher/server";
import { CONFIG_DIR } from "./config-dir";
import type { Disposable } from "../../core";

const watchers = new Map<string, Set<() => void>>();
let watcher: FileWatcher | null = null;

function notifyWatchers(abs: string): void {
  const cbs = watchers.get(abs);
  if (!cbs || cbs.size === 0) return;
  for (const cb of cbs) cb();
}

export async function initConfigWatcher(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true });

  watcher = await createFileWatcher({
    dirs: [CONFIG_DIR],
    onChange: (events) => {
      const paths = new Set(events.map((e) => e.path));
      for (const p of paths) {
        if (watchers.has(p)) notifyWatchers(p);
      }
    },
    // No blanket reconcile. Config files only ever change in-process (setConfig /
    // fork) or via ./singularity build propagation, and the parcel subscription
    // above fires on every disk write regardless of which process wrote it — so a
    // missed event is structurally impossible. The default 30s reconcile re-fired
    // EVERY watched path (2 per descriptor), each re-reading from disk and re-running
    // a full conflicts recompute, producing an O(N²) idle I/O storm with nothing
    // changed. Disable it; rely on the real fs-event path.
    reconcileMs: null,
    extensions: [".jsonc"],
  });
}

export async function shutdownConfigWatcher(): Promise<void> {
  if (watcher) { await watcher.stop(); watcher = null; }
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
