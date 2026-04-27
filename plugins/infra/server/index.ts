import type { ServerPluginDefinition } from "@server/types";

export default {
  id: "infra",
  name: "Infra",
  description:
    "Umbrella for cross-cutting server-side primitives used by feature plugins: jobs, events, secrets, mcp, attachments.",
} satisfies ServerPluginDefinition;
