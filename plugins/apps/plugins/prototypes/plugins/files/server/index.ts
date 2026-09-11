import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  createPrototype,
  listPrototypes,
  PROTOTYPE_ASSET_ROUTE,
  PROTOTYPE_FILE_ROUTE,
  PROTOTYPE_VERSION_FILE_ROUTE,
  restorePrototypeVersion,
} from "../core";
import {
  handleCreate,
  handleList,
  handlePrototypeAsset,
  handlePrototypeFile,
} from "./internal/handlers";
import {
  handlePrototypeVersionFile,
  handleRestoreVersion,
  prototypeHistoryLiveResource,
} from "./internal/history";
import {
  prototypesResource,
  prototypesVersionResource,
} from "./internal/resources";
import {
  startPrototypesWatcher,
  stopPrototypesWatcher,
} from "./internal/watcher";

// What this plugin knows about the prototypes tree that a sibling cannot
// re-derive without duplicating it: where it IS, what is in it, and when it
// changed. `onPrototypesChanged` in particular is what keeps a second file
// watcher off the same directory. `prototypesDir` is this plugin's OWN data-dir
// declaration (`data-dirs/`) — a data dir is declared exactly once, by the plugin
// that creates, seeds, serves and watches the tree — so surfacing it here is
// exporting a symbol from its home, not proxying another plugin's.
export { prototypesDir } from "../data-dirs";
export { listPrototypeMetas } from "./internal/list";
export { onPrototypesChanged } from "./internal/watcher";
// The version store's one write a sibling needs: the `checkpoints` plugin
// records a version at the end of every agent turn that touched a prototype.
export { checkpointPrototype } from "./internal/history";

export default {
  // Names the declaration rather than spelling the path: a plugin description is
  // read TEXTUALLY by the docs pipeline, which rejects anything but a static
  // string literal — so this one field cannot interpolate
  // PROTOTYPES_DIR_DISPLAY the way every other message here does.
  description:
    "Serves raw prototype files from the host-global prototypes data dir (the `apps/prototypes` declaration — shared by every worktree and main, so a mock is visible without a build and without being committed), seeds the repo's _template/ into it, declares the list + version live-state resources, watches the dir to auto-reload open iframes on edit, stamps a document's picked options (?<option>=<value>) onto its <html data-*>, and keeps each prototype's version history (a private git repo per prototype under _history/: the per-prototype history resource, a version's files, restore, and checkpointPrototype).",
  httpRoutes: {
    [listPrototypes.route]: handleList,
    [createPrototype.route]: handleCreate,
    [PROTOTYPE_FILE_ROUTE]: handlePrototypeFile,
    [PROTOTYPE_ASSET_ROUTE]: handlePrototypeAsset,
    [PROTOTYPE_VERSION_FILE_ROUTE]: handlePrototypeVersionFile,
    [restorePrototypeVersion.route]: handleRestoreVersion,
  },
  contributions: [
    Resource.Declare(prototypesResource),
    Resource.Declare(prototypesVersionResource),
    Resource.Declare(prototypeHistoryLiveResource),
  ],
  onReady: async () => {
    await startPrototypesWatcher();
  },
  onShutdown: async () => {
    await stopPrototypesWatcher();
  },
} satisfies ServerPluginDefinition;
