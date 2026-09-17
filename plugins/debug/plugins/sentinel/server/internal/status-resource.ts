import { defineExternalResource } from "@plugins/framework/plugins/server-core/core";
import {
  createFileWatcher,
  type FileWatcher,
} from "@plugins/infra/plugins/file-watcher/server";
import { sentinelStatusDir } from "../../data-dirs";
import { sentinelStatusResource as descriptor } from "../../core";
import { readSentinelWatch } from "./status-file";

// `sentinel.status` on EVERY backend, not just main: the watcher runs only in
// main, but an agent mostly looks at its own worktree's health report. Every
// backend serves the host-global status file main writes, and pushes when that
// file changes — the file-watcher primitive, no polling. External, not
// DB-backed, so it keeps the hand `notify()`.
//
// The pid-liveness half of the value is computed at read time, so a main that
// died without writing `stopped` reads as not running the next time anything
// reads the file (a subscribe, a reconnect, any later write).
export const sentinelStatusServerResource = defineExternalResource(descriptor, {
  mode: "push",
  loader: () => Promise.resolve(readSentinelWatch(sentinelStatusDir.path)),
});

let watcher: FileWatcher | null = null;

export async function startStatusWatcher(): Promise<void> {
  if (watcher) return;
  // Subscribing to a missing directory fails; the dir is host-global and cheap.
  const dir = sentinelStatusDir.ensure();
  watcher = await createFileWatcher({
    dirs: [dir],
    extensions: [".json"],
    name: "sentinel-status",
    onChange: () => sentinelStatusServerResource.notify(),
  });
}

export async function stopStatusWatcher(): Promise<void> {
  const w = watcher;
  watcher = null;
  await w?.stop();
}
