import { Resource, setErrorReporter } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleReport } from "./internal/handle-report";
import { crashesResource } from "./internal/resources";
import { recordCrash } from "./internal/record-crash";
import { ensureCrashesMetaTask } from "./internal/meta-crashes";
import { flushBufferedCrashes, installProcessHooks } from "./internal/process-hooks";
import { reportCrash } from "../shared/endpoints";

export { _crashes } from "./internal/tables";
export { crashesResource } from "./internal/resources";
export { CRASHES_META_TASK_ID } from "./internal/meta-crashes";
export { recordCrash } from "./internal/record-crash";
export { CrashNoiseRule } from "./internal/noise-rules";
export type { CrashNoiseRuleSpec, CrashNoiseInput } from "./internal/noise-rules";

export default {
  name: "Crashes",
  description: "Records server/frontend crashes and files deduped tasks.",
  httpRoutes: {
    [reportCrash.route]: handleReport,
  },
  contributions: [Resource.Declare(crashesResource)],
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
