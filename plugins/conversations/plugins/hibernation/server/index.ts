import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { ConfigV2 } from "@plugins/config_v2/server";
import { hibernationConfig } from "@plugins/conversations/core";
import { hibernateIdleJob } from "./internal/hibernate-idle-job";
import { handleViewed } from "./internal/handle-viewed";
import { markViewed } from "../shared/endpoints";

export default {
  description:
    "Idle-conversation hibernation policy: a scheduled idle-kill job, the viewed/resume endpoint, and the global hibernation config.",
  httpRoutes: {
    [markViewed.route]: handleViewed,
  },
  contributions: [ConfigV2.Register({ descriptor: hibernationConfig })],
  register: [hibernateIdleJob],
} satisfies ServerPluginDefinition;
