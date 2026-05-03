import type { ServerPluginDefinition } from "@server/types";
import { refAdvanced } from "./internal/tables-ref-advanced";
import { refHeadResource } from "./internal/ref-head-resource";
import { startGitWatcher, stopGitWatcher } from "./internal/watcher";

export { refHeadResource } from "./internal/ref-head-resource";
export { refAdvanced, _refAdvancedTriggers } from "./internal/tables-ref-advanced";
export type { RefAdvancedPayload, RefHead } from "../shared/types";
export { RefHeadSchema } from "../shared/types";

export default {
  id: "git-watcher",
  name: "Git Watcher",
  description:
    "Watches local git refs (refs/heads/main by default) via @parcel/watcher. Emits the git.refAdvanced trigger event and notifies the refHeadResource live-state resource on every advance.",
  loadBearing: true,
  resources: [refHeadResource],
  register: [refAdvanced],
  onReady: async () => {
    await startGitWatcher();
  },
  onShutdown: async () => {
    await stopGitWatcher();
  },
} satisfies ServerPluginDefinition;
