import type { ServerPluginDefinition } from "@server/types";
import { handleTree } from "./internal/tree-handler";

export default {
  id: "publish",
  name: "Publish",
  description:
    "Read-only review surface for the marketplace publish flow. Walks the worktree's plugin tree and exposes it as a flat tree.",
  httpRoutes: {
    "GET /api/publish/tree": handleTree,
  },
} satisfies ServerPluginDefinition;
