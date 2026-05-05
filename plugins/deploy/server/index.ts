import type { ServerPluginDefinition } from "@server/types";

export default {
  id: "deploy",
  name: "Deploy",
  description:
    "Self-hosted deployment platform. Manages remote servers, health checks, deploys, and logs from the UI.",
} satisfies ServerPluginDefinition;
