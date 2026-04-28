import type { EditedFileStatus } from "../../../../shared/protocol";
import { FileContent } from "./file-content";
import { FilePathLabel } from "./file-path-label";
import { FileTabs } from "./file-tabs";
import { useFileRenderers } from "./use-file-renderers";

export function FilePaneView({
  worktree,
  path,
  status,
}: {
  worktree: string;
  path: string;
  status: EditedFileStatus;
}) {
  const renderers = useFileRenderers({ path, status });
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-2 py-1.5 text-sm">
        <div className="min-w-0 flex-1">
          <FilePathLabel path={path} />
        </div>
        <FileTabs {...renderers} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <FileContent worktree={worktree} path={path} active={renderers.active} />
      </div>
    </div>
  );
}
