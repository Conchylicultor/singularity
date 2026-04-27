import type { ServerPluginDefinition } from "@server/types";
import {
  yakShavingCategoriesResource,
  yakShavingNodesResource,
} from "./internal/resources";
import { ensureYakMetaTask } from "./internal/meta-yak-shaving";
import { handleRebuild } from "./internal/handle-rebuild";
import "./internal/mcp-tools";

export { _yakShavingCategories, _yakShavingNodes } from "./internal/tables";
export {
  YakShavingCategorySchema,
  YakShavingNodeSchema,
} from "./internal/schema";
export type {
  YakShavingCategory,
  YakShavingNode,
} from "./internal/schema";
export {
  yakShavingCategoriesResource,
  yakShavingNodesResource,
} from "./internal/resources";
export { YAK_META_TASK_ID } from "./internal/meta-yak-shaving";

export default {
  id: "yak-shaving",
  name: "Yak Shaving",
  description:
    "Persisted tree of conversations annotated with one-line context, status, and next-action. Curated by a Sonnet model.",
  resources: [yakShavingNodesResource, yakShavingCategoriesResource],
  httpRoutes: {
    "POST /api/yak/rebuild": handleRebuild,
  },
  onReady: async () => {
    await ensureYakMetaTask();
  },
} satisfies ServerPluginDefinition;
