// In-plugin imports go straight to the leaf so the frontend bundle doesn't
// pull `server/api`'s runtime surface. Cross-plugin consumers go through
// `@plugins/yak-shaving/server`.
import type { YakShavingNode } from "../server/internal/schema";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";

export type { YakShavingNode } from "../server/internal/schema";

export const yakShavingNodesResource =
  resourceDescriptor<YakShavingNode[]>("yak-shaving-nodes");
