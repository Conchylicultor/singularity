import { pageDetailPane } from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import { StarButton } from "./star-button";

/** Star toggle contributed to the page-detail pane header (`pageDetailPane.Actions`). */
export function StarHeaderAction() {
  const { pageId } = pageDetailPane.useParams();
  return <StarButton pageId={pageId} />;
}
