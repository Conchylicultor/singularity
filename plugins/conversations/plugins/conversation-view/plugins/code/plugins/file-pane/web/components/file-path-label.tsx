import { useCallback, useState } from "react";
import { MdContentCopy, MdCheck } from "react-icons/md";
import { Button } from "@/components/ui/button";

export function FilePathLabel({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const copyPath = useCallback(() => {
    void navigator.clipboard.writeText(path).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [path]);
  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash + 1) : "";
  const basename = slash >= 0 ? path.slice(slash + 1) : path;
  return (
    <span className="flex min-w-0 items-baseline gap-1">
      <span className="truncate font-normal text-muted-foreground">{dir}</span>
      <span className="truncate font-medium">{basename}</span>
      <Button
        variant="ghost"
        size="icon"
        className="size-5 shrink-0 text-muted-foreground hover:text-foreground"
        title="Copy path"
        aria-label="Copy path"
        onClick={copyPath}
      >
        {copied ? (
          <MdCheck className="size-3" />
        ) : (
          <MdContentCopy className="size-3" />
        )}
      </Button>
    </span>
  );
}
