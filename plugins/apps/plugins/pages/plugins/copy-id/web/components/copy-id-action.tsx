import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useCopyToClipboard } from "@plugins/primitives/plugins/copy-to-clipboard/web";
import { symbol } from "@plugins/ui/plugins/icons/core";

const checkIcon = symbol("check");
const contentCopyIcon = symbol("content-copy");

/**
 * "Copy block ID" header action contributed to `PageDetail.HeaderActions`.
 *
 * A page IS a block, so its `pageId` is the block id an agent's page tools take
 * — the same id the gutter menu's "Copy block ID" copies for a block inside the
 * page. The button stays put after a click, so its own check-mark flash (and the
 * tooltip reading "Copied") is the feedback; no toast.
 */
export function CopyIdAction({ pageId }: { pageId: string }) {
  const { copy, copied } = useCopyToClipboard(pageId);
  return (
    <IconButton
      icon={copied ? checkIcon : contentCopyIcon}
      label="Copy block ID"
      tooltip={copied ? "Copied" : "Copy block ID"}
      onClick={copy}
    />
  );
}
