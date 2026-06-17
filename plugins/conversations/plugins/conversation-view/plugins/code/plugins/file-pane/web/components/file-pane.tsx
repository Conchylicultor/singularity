import type { EditedFileStatus } from "@plugins/conversations/plugins/conversation-view/plugins/code/core";
import { FileContent } from "./file-content";
import { FilepathBreadcrumb } from "@plugins/primitives/plugins/filepath-breadcrumb/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { FileTabs } from "./file-tabs";
import { useFileRenderers } from "./use-file-renderers";

export function FilePaneView({
  worktree,
  path,
  status,
  line,
}: {
  worktree: string;
  path: string;
  status: EditedFileStatus;
  line?: number;
}) {
  const renderers = useFileRenderers({ path, status });
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Text
        as="div"
        variant="body"
        className="flex items-center gap-sm border-b px-sm py-xs"
      >
        <div className="min-w-0 flex-1">
          <FilepathBreadcrumb path={path} />
        </div>
        <FileTabs {...renderers} />
      </Text>
      <div className="min-h-0 flex-1 overflow-auto">
        <FileContent worktree={worktree} path={path} line={line} active={renderers.active} />
      </div>
    </div>
  );
}
