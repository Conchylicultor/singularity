import { MdCheck, MdContentCopy } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "./use-copy-to-clipboard";

export interface CopyButtonProps {
  text: string;
  title?: string;
  className?: string;
  iconClassName?: string;
}

export function CopyButton({
  text,
  title,
  className,
  iconClassName = "size-3",
}: CopyButtonProps) {
  const { copy, copied } = useCopyToClipboard(text);
  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      title={title}
      aria-label={title}
      onClick={copy}
    >
      {copied ? (
        <MdCheck className={iconClassName} />
      ) : (
        <MdContentCopy className={iconClassName} />
      )}
    </Button>
  );
}
