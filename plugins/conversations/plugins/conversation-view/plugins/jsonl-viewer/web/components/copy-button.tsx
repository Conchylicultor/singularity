import { useCallback, useState, type MouseEvent } from "react";
import { MdCheck, MdContentCopy } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CopyButton({
  text,
  title = "Copy",
  className,
}: {
  text: string;
  title?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const onClick = useCallback(
    (e: MouseEvent) => {
      // Prevent <summary> from toggling its <details> when the button lives inside one.
      e.preventDefault();
      e.stopPropagation();
      void navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    },
    [text],
  );
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "size-5 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100",
        className,
      )}
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      {copied ? <MdCheck className="size-3" /> : <MdContentCopy className="size-3" />}
    </Button>
  );
}
