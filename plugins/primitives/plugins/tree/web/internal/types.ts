import type { Rank } from "@plugins/primitives/plugins/rank/shared";

export type TreeItem = {
  id: string;
  parentId: string | null;
  rank: Rank;
  expanded: boolean;
};
