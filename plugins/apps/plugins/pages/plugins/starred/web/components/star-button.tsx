import { MdGrade, MdStarBorder } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useStar } from "../internal/use-star";

/**
 * Presentational star toggle shared by the sidebar row action and the page
 * header. Filled star (MdGrade) when favorited, outline (MdStarBorder) when not.
 */
export function StarButton({ pageId }: { pageId: string }) {
  const { isStarred, toggle } = useStar(pageId);
  return (
    <IconButton
      icon={isStarred ? MdGrade : MdStarBorder}
      label={isStarred ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={isStarred}
      onClick={toggle}
    />
  );
}
