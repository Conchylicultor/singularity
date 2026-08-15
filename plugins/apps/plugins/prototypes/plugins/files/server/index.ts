import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  listPrototypes,
  PROTOTYPE_ASSET_ROUTE,
  PROTOTYPE_FILE_ROUTE,
} from "../core";
import {
  handleList,
  handlePrototypeAsset,
  handlePrototypeFile,
} from "./internal/handlers";
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
    [PROTOTYPE_FILE_ROUTE]: handlePrototypeFile,
    [PROTOTYPE_ASSET_ROUTE]: handlePrototypeAsset,
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
