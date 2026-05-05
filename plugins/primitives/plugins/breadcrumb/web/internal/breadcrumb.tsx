import { useCallback, useState } from "react";
import { MdContentCopy, MdCheck } from "react-icons/md";
import { Button } from "@/components/ui/button";

export interface BreadcrumbProps {
  path: string;
  onNavigate?: (dirPath: string) => void;
}

export function Breadcrumb({ path, onNavigate }: BreadcrumbProps) {
  const [copied, setCopied] = useState(false);
  const copyPath = useCallback(() => {
    void navigator.clipboard.writeText(path).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [path]);

  const segments = path.split("/");
  const dirs = segments.slice(0, -1);
  const basename = segments[segments.length - 1] ?? "";

  return (
    <span className="flex min-w-0 items-baseline gap-0.5">
      <span className="flex min-w-0 shrink items-baseline truncate">
        {dirs.map((seg, i) => {
          const dirPath = segments.slice(0, i + 1).join("/");
          return (
            <span key={i} className="flex items-baseline whitespace-nowrap">
              {onNavigate ? (
                <button
                  type="button"
                  className="font-normal text-muted-foreground hover:text-foreground hover:underline"
                  onClick={() => onNavigate(dirPath)}
                >
                  {seg}
                </button>
              ) : (
                <span className="font-normal text-muted-foreground">{seg}</span>
              )}
              <span className="font-normal text-muted-foreground/50">/</span>
            </span>
          );
        })}
      </span>
      <span className="shrink-0 truncate font-medium">{basename}</span>
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
