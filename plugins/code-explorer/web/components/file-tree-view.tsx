import { useEffect, useState } from "react";
import { FilePaneView } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Text } from "@plugins/primitives/plugins/text/web";
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
            <Text as="div" variant="body" className="px-3 py-2 text-muted-foreground">
              Loading…
            </Text>
          ) : error ? (
            <Text as="div" variant="body" className="px-3 py-2 text-destructive">
              {String(error)}
            </Text>
          ) : !treeData || treeData.files.length === 0 ? (
            <Text as="div" variant="body" className="px-3 py-2 text-muted-foreground">
              No files.
            </Text>
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
            <Text as="div" variant="body" className="flex h-full items-center justify-center px-3 py-2 text-muted-foreground">
              Select a file to preview.
            </Text>
          )}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
