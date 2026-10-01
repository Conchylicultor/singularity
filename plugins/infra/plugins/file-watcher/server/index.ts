import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { defineFileWatcher } from "./internal/define";
export type { ServerFileWatcherSpec } from "./internal/define";
export {
  BATCH_SAMPLE_MAX,
  fileWatcherRecentRuns,
  listFileWatchers,
  onWatcherActivity,
} from "../shared/registry";
export type {
  FileChangeEvent,
  FileWatcherBatch,
  FileWatcherDecl,
  FileWatcherInstanceInfo,
  FileWatcherSnapshot,
  FileWatcherSpec,
  FileWatcherStartOptions,
} from "../shared/registry";
export { WRITES_WHILE_OPEN_MAX_ENTRIES } from "../shared/engine";
export type { FileWatcher, WatcherBackend } from "../shared/engine";

export default {
  description:
    "defineFileWatcher: the one declared in-process file watcher — a named, described declaration (static policy: extensions, ignore, debounce, ceiling, writesWhileOpen, reconcile, mainOnly) whose start({dirs, label, onChange, onReconcile}) opens instances over one @parcel/watcher engine (debounce + ceiling flush, reconcile timer, kqueue sizing). Records per declaration its open instances, last change batch and a ring of handler runs for the Background activity catalog (onWatcherActivity / listFileWatchers / fileWatcherRecentRuns). The cli barrel's watchForCommand is the same engine for a foreground command, with no registry.",
} satisfies ServerPluginDefinition;
