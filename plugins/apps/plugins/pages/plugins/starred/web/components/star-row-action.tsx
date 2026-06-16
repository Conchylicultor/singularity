import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import type { Block } from "@plugins/page/plugins/editor/core";
import { StarButton } from "./star-button";

/** Star toggle contributed to the page-tree row actions slot. */
export function StarRowAction({ row }: ItemActionProps<Block>) {
  return <StarButton pageId={row.id} />;
}
