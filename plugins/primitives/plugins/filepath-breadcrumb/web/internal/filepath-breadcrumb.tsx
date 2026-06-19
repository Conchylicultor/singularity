import { CopyButton } from "@plugins/primitives/plugins/copy-to-clipboard/web";
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

  const copyAction = showCopy ? (
    <CopyButton
      text={path}
      size="inline"
      className="text-muted-foreground hover:text-foreground"
      title="Copy path"
    />
  ) : undefined;

  return (
    <Breadcrumb
      segments={segments}
      onNavigate={handleNavigate}
      actions={copyAction}
    />
  );
}
