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
    onReconcile: () => {
      for (const abs of watchers.keys()) notifyWatchers(abs);
    },
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
