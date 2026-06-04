import { Resource } from "@plugins/framework/plugins/server-core/core";
import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { exitCleanFinalizeJob } from "./internal/exit-clean-finalize-job";
import { exitCleanTool, flagRaiseTool } from "./internal/mcp-tools";
import { pushAndExitResource } from "./internal/state";
import { handleStart } from "./internal/handle-start";
import { handleCancel } from "./internal/handle-cancel";
import { startPushAndExit, cancelPushAndExit } from "../shared/endpoints";
import { pushAndExitConfig } from "../shared/config";

export default {
  name: "Push and Exit",
  contributions: [Resource.Declare(pushAndExitResource), ConfigV2.Register({ descriptor: pushAndExitConfig })],
  httpRoutes: {
    [startPushAndExit.route]:  handleStart,
    [cancelPushAndExit.route]: handleCancel,
  },
  register: [exitCleanFinalizeJob, exitCleanTool, flagRaiseTool],
} satisfies ServerPluginDefinition;
