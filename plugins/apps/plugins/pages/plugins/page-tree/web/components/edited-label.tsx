import { useLive } from "@plugins/network/plugins/live/web";
import { ResourceErrorInline } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { pageEditedAt } from "@plugins/page/plugins/editor/core";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { pageDetailPane } from "../panes";

const historyIcon = symbol("history");

/**
 * "Edited 2h ago" in the page-detail title bar (`pageDetailPane.Actions`,
 * muted text beside the page's own actions).
 *
 * The time is the editor's `pageEditedAt` — the newest `updatedAt` across the
 * page row AND its content blocks. The page row alone is not enough: a content
 * edit stamps only the edited block's own row and never touches the page row,
 * which moves only on a rename, a cover or a kind change.
 *
 * Not known yet renders a placeholder, never a time.
 */
export function EditedLabel() {
  const { pageId } = pageDetailPane.useParams();
  const result = useLive(pageEditedAt, { pageId });
  switch (result.status) {
    case "loading":
      return <Loading variant="block" className="h-4 w-20" />;
    case "error":
      return (
        <ResourceErrorInline
          variant="icon"
          icon={historyIcon}
          subject="when this page was edited"
          error={result.error}
          refetch={result.refetch}
        />
      );
    case "ready":
      // No such live page (deleted under the pane): no edit time to tell; the
      // pane itself renders the missing page.
      if (result.data === null) return null;
      return (
        // 8px more air after it than between the bar's actions: the time is
        // a statement about the page, set apart from the controls after it.
        <Text
          variant="caption"
          tone="faint"
          style={{ marginRight: "var(--space-sm)" }}
        >
          Edited <RelativeTime date={result.data.editedAt} />
        </Text>
      );
  }
}
