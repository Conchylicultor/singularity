import { MdGrade, MdStarBorder } from "react-icons/md";
import { useStar } from "../internal/use-star";

/**
 * Presentational star toggle shared by the sidebar row action and the page
 * header. Filled star (MdGrade) when favorited, outline (MdStarBorder) when not.
 */
export function StarButton({ pageId }: { pageId: string }) {
  const { isStarred, toggle } = useStar(pageId);
  return (
    <button
      type="button"
      onClick={toggle}
      title={isStarred ? "Remove from favorites" : "Add to favorites"}
      aria-label={isStarred ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={isStarred}
      className="hover:bg-background/60 flex size-6 shrink-0 items-center justify-center rounded-md"
    >
      {isStarred ? <MdGrade className="size-4" /> : <MdStarBorder className="size-4" />}
    </button>
  );
}
