import { MdStar, MdStarBorder } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useBrowserNav } from "@plugins/apps/plugins/browser/plugins/shell/web";
import { useBookmarks } from "../internal/use-bookmarks";
import { hostOf } from "../internal/host-of";

/**
 * Star toggle for the chrome bar's trailing actions. Filled when the current
 * URL is bookmarked, outline otherwise. Disabled on the start page.
 */
export function BookmarkStar() {
  const { current } = useBrowserNav();
  const { isBookmarked, toggle } = useBookmarks();
  const bookmarked = current !== "" && isBookmarked(current);

  return (
    <IconButton
      icon={bookmarked ? MdStar : MdStarBorder}
      label={bookmarked ? "Remove bookmark" : "Add bookmark"}
      tooltip={bookmarked ? "Remove bookmark" : "Add bookmark"}
      disabled={current === ""}
      onClick={() => {
        if (current !== "") {
          void toggle(current, hostOf(current));
        }
      }}
    />
  );
}
