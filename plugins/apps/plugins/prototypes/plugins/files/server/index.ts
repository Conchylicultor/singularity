import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { listPrototypes } from "../core";
import { handleList, handlePrototypeFile } from "./internal/handlers";
import {
  prototypesResource,
  prototypesVersionResource,
} from "./internal/resources";
import {
  startPrototypesWatcher,
  stopPrototypesWatcher,
} from "./internal/watcher";

export default {
  description:
    "Serves raw prototype files from the repo-root prototypes/ dir, declares the list + version live-state resources, and watches the dir to auto-reload open iframes on edit.",
  httpRoutes: {
    [listPrototypes.route]: handleList,
    "GET /api/prototypes/:name": handlePrototypeFile,
  },
  contributions: [
    Resource.Declare(prototypesResource),
    Resource.Declare(prototypesVersionResource),
  ],
  onReady: async () => {
    await startPrototypesWatcher();
  },
  onShutdown: async () => {
    await stopPrototypesWatcher();
  },
} satisfies ServerPluginDefinition;
