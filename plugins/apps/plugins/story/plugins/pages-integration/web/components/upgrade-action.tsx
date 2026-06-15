import { MdAutoStories } from "react-icons/md";
import { WithTooltip } from "@plugins/primitives/plugins/tooltip/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import type { Block } from "@plugins/page/plugins/editor/core";
import {
  useIsStory,
  markStory,
  unmarkStory,
} from "@plugins/apps/plugins/story/plugins/marker/web";

/**
 * Page-tree row action that toggles the story capability on a page. Upgrading is
 * non-destructive (the page and its blocks are untouched — only the marker
 * side-table row is added/removed), so unlike the sibling delete action this
 * needs no confirm dialog: a single tap flips it.
 *
 * Mirrors the button chrome of `DeletePageAction` (same hover/size classes,
 * `stopPropagation` so the row doesn't select).
 */
export function UpgradeAction({ row }: ItemActionProps<Block>) {
  const pageId = row.id;
  const isStory = useIsStory(pageId);

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    void (isStory ? unmarkStory(pageId) : markStory(pageId));
  };

  const label = isStory ? "Remove story" : "Upgrade to story";

  return (
    <WithTooltip content={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="hover:bg-background/60 flex size-6 shrink-0 items-center justify-center rounded-md"
      >
        <MdAutoStories className="size-4" />
      </button>
    </WithTooltip>
  );
}
