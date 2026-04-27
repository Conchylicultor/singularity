import type { ServerPluginDefinition } from "@server/types";
import { yakShavingNodesResource } from "./internal/resources";
import { ensureYakMetaTask } from "./internal/meta-yak-shaving";
import { handleRebuild } from "./internal/handle-rebuild";
import "./internal/mcp-tools";

export { _yakShavingNodes } from "./internal/tables";
export { YakShavingNodeSchema } from "./internal/schema";
export type { YakShavingNode } from "./internal/schema";
export { yakShavingNodesResource } from "./internal/resources";
export { YAK_META_TASK_ID } from "./internal/meta-yak-shaving";

export default {
  id: "yak-shaving",
  name: "Yak Shaving",
  description:
    "Persisted tree of conversations annotated with one-line context, status, and next-action. Curated by a Sonnet model.",
  resources: [yakShavingNodesResource],
  httpRoutes: {
    "POST /api/yak/rebuild": handleRebuild,
  },
  onReady: async () => {
    await ensureYakMetaTask();
  },
} satisfies ServerPluginDefinition;
