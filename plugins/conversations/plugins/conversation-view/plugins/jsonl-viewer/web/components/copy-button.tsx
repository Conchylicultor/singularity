import { useCallback, useState } from "react";
import { MdCheck, MdContentCopy } from "react-icons/md";
import { RowActionButton } from "./row-action-button";

export function CopyTextAction({
  text,
  title = "Copy",
}: {
  text: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);
  const onClick = useCallback(() => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);
  return (
    <RowActionButton title={title} onClick={onClick}>
      {copied ? <MdCheck className="size-3" /> : <MdContentCopy className="size-3" />}
    </RowActionButton>
  );
}
