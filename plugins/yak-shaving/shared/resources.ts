// In-plugin imports go straight to the leaf so the frontend bundle doesn't
// pull `server/api`'s runtime surface. Cross-plugin consumers go through
// `@plugins/yak-shaving/server`.
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";
import { z } from "zod";
import {
  YakShavingNodeSchema,
  YakShavingCategorySchema,
  type YakShavingNode,
  type YakShavingCategory,
} from "./schemas";

export type { YakShavingCategory, YakShavingNode } from "./schemas";

export const yakShavingNodesResource =
  resourceDescriptor<YakShavingNode[]>("yak-shaving-nodes", z.array(YakShavingNodeSchema));

export const yakShavingCategoriesResource =
  resourceDescriptor<YakShavingCategory[]>("yak-shaving-categories", z.array(YakShavingCategorySchema));
