import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useCopyToClipboard } from "@plugins/primitives/plugins/copy-to-clipboard/web";
import { pageDetailPane } from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import { symbol } from "@plugins/ui/plugins/icons/core";

const checkIcon = symbol("check");
const contentCopyIcon = symbol("content-copy");

/**
 * "Copy block ID" header action contributed to `pageDetailPane.Actions`.
 *
 * A page IS a block, so its `pageId` is the block id an agent's page tools take
 * — the same id the gutter menu's "Copy block ID" copies for a block inside the
 * page. The button stays put after a click, so its own check-mark flash (and the
 * tooltip reading "Copied") is the feedback; no toast.
 */
export function CopyIdAction() {
  const { pageId } = pageDetailPane.useParams();
  const { copy, copied } = useCopyToClipboard(pageId);
  return (
    <IconButton
      icon={copied ? checkIcon : contentCopyIcon}
      label="Copy block ID"
      // A secondary action riding beside the title: the same box as the bar's
      // other icon buttons, a smaller glyph.
      glyph="small"
      tooltip={copied ? "Copied" : "Copy block ID"}
      onClick={copy}
    />
  );
}
