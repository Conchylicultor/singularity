import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";

export { createFileWatcher } from "./internal/create-file-watcher";
export type { FileWatcher, FileWatcherOptions } from "./internal/create-file-watcher";

export default {
  id: "infra-file-watcher",
  name: "File Watcher",
  description:
    "Shared @parcel/watcher primitive with debounce, ceiling, and reconcile timer management.",
} satisfies ServerPluginDefinition;
