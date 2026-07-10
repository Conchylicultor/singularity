import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { midiFoldersConfig } from "../shared/config";
import { importMidiFileJob } from "./internal/import-job";
import { midiFoldersWarmup } from "./internal/reconcile";
import {
  startMidiFolderWatcher,
  stopMidiFolderWatcher,
} from "./internal/watcher";

export default {
  description:
    "Watches configured folders for .mid/.midi files and mirrors them into the Sonata library: auto-imports on create/edit (via a per-file job), badges 'source deleted' on removal, and reconciles drift on boot and config change. The watched-folder list is a config_v2 listField rendered for free in the settings pane.",
  contributions: [ConfigV2.Register({ descriptor: midiFoldersConfig })],
  register: [importMidiFileJob, midiFoldersWarmup],
  // onReady now only MOUNTS the watcher (cheap); the heavy boot reconcile is the
  // deferred `midiFoldersWarmup`, drained after onAllReady.
  onReady: async () => {
    await startMidiFolderWatcher();
  },
  onShutdown: async () => {
    await stopMidiFolderWatcher();
  },
} satisfies ServerPluginDefinition;
