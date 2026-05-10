import type { ServerPluginDefinition } from "@server/types";
import { setErrorReporter } from "@server/error-reporter";
import { handleReport } from "./internal/handle-report";
import { crashesResource } from "./internal/resources";
import { recordCrash } from "./internal/record-crash";
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
    setErrorReporter((report) => {
      void recordCrash({
        source: "server-caught",
        message: report.message,
        stack: report.stack,
        errorType: report.errorType,
      });
    });
    await ensureCrashesMetaTask();
    await flushBufferedCrashes();
  },
} satisfies ServerPluginDefinition;
