import { MdGrade, MdStarBorder } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useStar } from "../internal/use-star";

/**
 * Presentational star toggle shared by the sidebar row action and the page
 * header. Filled star (MdGrade) when favorited, outline (MdStarBorder) when not.
 */
export function StarButton({ pageId }: { pageId: string }) {
  const star = useStar(pageId);
  if (star.pending) {
    // Not known yet: the button's own loading state (a spinner, disabled) —
    // never the hollow star, which is what "not a favorite" looks like.
    return <IconButton icon={MdStarBorder} label="Loading favorites" loading />;
  }
  const { isStarred, toggle } = star;
  return (
    <IconButton
      icon={isStarred ? MdGrade : MdStarBorder}
      label={isStarred ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={isStarred}
      onClick={toggle}
    />
  );
}
