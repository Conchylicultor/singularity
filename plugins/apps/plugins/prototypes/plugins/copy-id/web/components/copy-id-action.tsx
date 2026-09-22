import { MdCheck, MdContentCopy } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useCopyToClipboard } from "@plugins/primitives/plugins/copy-to-clipboard/web";
import { usePrototypeDetail } from "@plugins/apps/plugins/prototypes/plugins/gallery/web";

/**
 * "Copy prototype ID" header action contributed to `prototypeDetailPane.Actions`.
 *
 * The id is the prototype's minted folder name (`proto-…`) — the one the
 * `./singularity prototype` commands and an agent prompt address it by. The
 * button stays put after a click, so its own check-mark flash (and the tooltip
 * reading "Copied") is the feedback; no toast.
 */
export function CopyIdAction() {
  const { name } = usePrototypeDetail();
  const { copy, copied } = useCopyToClipboard(name);
  return (
    <IconButton
      icon={copied ? MdCheck : MdContentCopy}
      label="Copy prototype ID"
      tooltip={copied ? "Copied" : "Copy prototype ID"}
      onClick={copy}
    />
  );
}
