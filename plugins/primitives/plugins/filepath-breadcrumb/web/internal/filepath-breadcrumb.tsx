import { useCallback, useState } from "react";
import { MdContentCopy, MdCheck } from "react-icons/md";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  type BreadcrumbSegment,
} from "@plugins/primitives/plugins/breadcrumb/web";

export interface FilepathBreadcrumbProps {
  path: string;
  onNavigate?: (dirPath: string) => void;
  showCopy?: boolean;
}

export function FilepathBreadcrumb({
  path,
  onNavigate,
  showCopy = true,
}: FilepathBreadcrumbProps) {
  const [copied, setCopied] = useState(false);

  const pathSegments = path.split("/");
  const segments: BreadcrumbSegment[] = pathSegments.map((seg, i) => ({
    key: String(i),
    label: seg,
  }));

  const handleNavigate = onNavigate
    ? (index: number) => {
        const dirPath = pathSegments.slice(0, index + 1).join("/");
        onNavigate(dirPath);
      }
    : undefined;

  const copyPath = useCallback(() => {
    void navigator.clipboard.writeText(path).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [path]);

  const copyAction = showCopy ? (
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
  ) : undefined;

  return (
    <Breadcrumb
      segments={segments}
      onNavigate={handleNavigate}
      actions={copyAction}
    />
  );
}
