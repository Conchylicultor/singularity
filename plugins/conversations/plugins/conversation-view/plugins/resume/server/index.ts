import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleResume } from "./internal/handle-resume";
import { resumeConversationEndpoint } from "../shared/endpoints";

export default {
  name: "Resume",
  httpRoutes: {
    [resumeConversationEndpoint.route]: handleResume,
  },
} satisfies ServerPluginDefinition;
