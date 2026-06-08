import { useEffect, useState } from "react";
import { FilePaneView } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getCodeTree } from "../../shared/endpoints";
import { FileTree } from "./file-tree";

interface FileTreeViewProps {
  worktree: string;
}

export function FileTreeView({ worktree }: FileTreeViewProps) {
  const { data: treeData, isLoading, error } = useEndpoint(getCodeTree, { worktree });
  const [selectedPath, setSelectedPath] = useState<string>("");

  // Reset selection when worktree changes
  useEffect(() => {
    setSelectedPath("");
  }, [worktree]);

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-full"
      id="code-explorer-group"
    >
      <ResizablePanel id="tree" defaultSize={25} minSize={15}>
        <div className="h-full min-h-0 overflow-auto border-r">
          {isLoading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Loading…
            </div>
          ) : error ? (
            <div className="px-3 py-2 text-sm text-destructive">
              {String(error)}
            </div>
          ) : !treeData || treeData.files.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No files.
            </div>
          ) : (
            <FileTree
              files={treeData.files}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
            />
          )}
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="preview" defaultSize={75} minSize={30}>
        <div className="h-full min-h-0 overflow-hidden">
          {selectedPath ? (
            <FilePaneView
              worktree={worktree}
              path={selectedPath}
              status="clean"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-3 py-2 text-sm text-muted-foreground">
              Select a file to preview.
            </div>
          )}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
