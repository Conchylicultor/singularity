import type { ServerPluginDefinition } from "@server/types";
import { handleResume } from "./internal/handle-resume";
import { resumeConversationEndpoint } from "../shared/endpoints";

export default {
  id: "resume",
  name: "Resume",
  httpRoutes: {
    [resumeConversationEndpoint.route]: handleResume,
  },
} satisfies ServerPluginDefinition;
