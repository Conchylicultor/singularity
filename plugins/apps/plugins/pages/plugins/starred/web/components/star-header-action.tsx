import { StarButton } from "./star-button";

/** Star toggle contributed to the page-detail header actions slot. */
export function StarHeaderAction({ pageId }: { pageId: string }) {
  return <StarButton pageId={pageId} />;
}
