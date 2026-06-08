import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { exitCleanFinalizeJob } from "./internal/exit-clean-finalize-job";
import { exitCleanTool, flagRaiseTool } from "./internal/mcp-tools";
import { handleStart } from "./internal/handle-start";
import { startPushAndExit } from "../shared/endpoints";
import { pushAndExitConfig } from "../shared/config";

export default {
  name: "Push and Exit",
  contributions: [ConfigV2.Register({ descriptor: pushAndExitConfig })],
  httpRoutes: {
    [startPushAndExit.route]: handleStart,
  },
  register: [exitCleanFinalizeJob, exitCleanTool, flagRaiseTool],
} satisfies ServerPluginDefinition;
