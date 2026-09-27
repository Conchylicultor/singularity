import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useStar } from "../internal/use-star";
import { symbol } from "@plugins/ui/plugins/icons/core";

const starIcon = symbol("star");

/**
 * Presentational star toggle shared by the sidebar row action and the page
 * header. The star is drawn active (filled) when favorited, at rest when not.
 */
export function StarButton({ pageId }: { pageId: string }) {
  const star = useStar(pageId);
  if (star.pending) {
    // Not known yet: the button's own loading state (a spinner, disabled) —
    // never the hollow star, which is what "not a favorite" looks like.
    return <IconButton icon={starIcon} label="Loading favorites" loading />;
  }
  const { isStarred, toggle } = star;
  return (
    <IconButton
      icon={starIcon}
      active={isStarred}
      label={isStarred ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={isStarred}
      onClick={toggle}
    />
  );
}
