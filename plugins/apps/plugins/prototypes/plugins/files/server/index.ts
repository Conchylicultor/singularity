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

// What this plugin knows about the prototypes tree that a sibling cannot
// re-derive without duplicating it: what is in it, and when it changed.
// `onPrototypesChanged` in particular is what keeps a second file watcher off
// the same directory. Where the tree IS belongs to `infra/paths`, so consumers
// take PROTOTYPES_DIR from there — surfacing it here too would be a re-export
// of another plugin's symbol.
export { listPrototypeMetas } from "./internal/list";
export { onPrototypesChanged } from "./internal/watcher";

export default {
  // Names PROTOTYPES_DIR rather than spelling the path: a plugin description is
  // read TEXTUALLY by the docs pipeline, which rejects anything but a static
  // string literal — so this one field cannot interpolate
  // PROTOTYPES_DIR_DISPLAY the way every other message here does.
  description:
    "Serves raw prototype files from the host-global prototypes data dir (PROTOTYPES_DIR — shared by every worktree and main, so a mock is visible without a build and without being committed), seeds the repo's _template/ into it, declares the list + version live-state resources, and watches the dir to auto-reload open iframes on edit.",
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
