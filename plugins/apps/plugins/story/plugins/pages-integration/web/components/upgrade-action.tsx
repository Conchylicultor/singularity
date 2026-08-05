import { MdAutoStories } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
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
 * Renders the shared `IconButton` like its sibling row actions (delete, star) —
 * so it inherits the row's ambient control density and, being the generic
 * `{icon,label,onClick}` action component, follows its region's presentation
 * rather than hand-rolling its own chrome. `stopPropagation` keeps the row from
 * selecting.
 */
export function UpgradeAction({ row }: ItemActionProps<Block>) {
  const pageId = row.id;
  const isStory = useIsStory(pageId);

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    void (isStory ? unmarkStory(pageId) : markStory(pageId));
  };

  return (
    <IconButton
      icon={MdAutoStories}
      label={isStory ? "Remove story" : "Upgrade to story"}
      onClick={onClick}
    />
  );
}
