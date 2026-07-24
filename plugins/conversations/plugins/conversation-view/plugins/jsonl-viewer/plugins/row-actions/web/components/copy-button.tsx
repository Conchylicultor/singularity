import { MdCheck, MdContentCopy } from "react-icons/md";
import { useCopyToClipboard } from "@plugins/primitives/plugins/copy-to-clipboard/web";
import { RowActionButton } from "./row-action-button";

export function CopyTextAction({
  text,
  title = "Copy",
}: {
  text: string;
  title?: string;
}) {
  const { copy, copied } = useCopyToClipboard(text);
  return (
    <RowActionButton title={title} onClick={copy}>
      {copied ? <MdCheck className="size-3" /> : <MdContentCopy className="size-3" />}
    </RowActionButton>
  );
}
