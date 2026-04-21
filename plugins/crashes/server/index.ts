import type { ServerPluginDefinition } from "../../../server/src/types";
import { handleReport } from "./internal/handle-report";
import { crashesResource } from "./internal/resources";
import { ensureCrashesMetaTask } from "./internal/meta-crashes";
import { flushBufferedCrashes, installProcessHooks } from "./internal/process-hooks";

export { _crashes } from "./internal/tables";
export { crashesResource } from "./internal/resources";
export { CRASHES_META_TASK_ID } from "./internal/meta-crashes";
export { recordCrash } from "./internal/record-crash";

export default {
  id: "crashes",
  name: "Crashes",
  description: "Records server/frontend crashes and files deduped tasks.",
  httpRoutes: {
    "POST /api/crashes": handleReport,
  },
  resources: [crashesResource],
  onReady: async () => {
    installProcessHooks();
    await ensureCrashesMetaTask();
    await flushBufferedCrashes();
  },
} satisfies ServerPluginDefinition;
