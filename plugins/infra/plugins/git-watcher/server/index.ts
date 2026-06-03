import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { refAdvanced } from "./internal/tables-ref-advanced";
import { refHeadResource } from "./internal/ref-head-resource";
import { startGitWatcher, stopGitWatcher } from "./internal/watcher";

export { refHeadResource } from "./internal/ref-head-resource";
export { refAdvanced, _refAdvancedTriggers } from "./internal/tables-ref-advanced";
export type { RefAdvancedPayload, RefHead } from "../shared/types";
export { RefHeadSchema } from "../shared/types";

export default {
  name: "Git Watcher",
  description:
    "Watches local git refs (refs/heads/main by default) via @parcel/watcher. Emits the git.refAdvanced trigger event and notifies the refHeadResource live-state resource on every advance.",
  loadBearing: true,
  contributions: [Resource.Declare(refHeadResource)],
  register: [refAdvanced],
  onReady: async () => {
    await startGitWatcher();
  },
  onShutdown: async () => {
    await stopGitWatcher();
  },
} satisfies ServerPluginDefinition;
