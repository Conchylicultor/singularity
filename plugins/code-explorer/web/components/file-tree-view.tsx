import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useEffect, useState } from "react";
import { FilePaneView } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { getCodeTree } from "@plugins/code-explorer/plugins/code-api/core";
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
        <Scroll axis="both" fill className="h-full border-r">
          {isLoading ? (
            <Loading variant="rows" />
          ) : error ? (
            <Text as="div" variant="body" className="px-md py-sm text-destructive">
              {String(error)}
            </Text>
          ) : !treeData || treeData.files.length === 0 ? (
            <Text as="div" variant="body" className="px-md py-sm text-muted-foreground">
              No files.
            </Text>
          ) : (
            <FileTree
              files={treeData.files}
              selectedPath={selectedPath}
              onSelect={setSelectedPath}
            />
          )}
        </Scroll>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="preview" defaultSize={75} minSize={30}>
        <Clip fill className="h-full">
          {selectedPath ? (
            <FilePaneView
              worktree={worktree}
              path={selectedPath}
              status="clean"
            />
          ) : (
            <Center className="h-full">
              <Text as="div" variant="body" className="px-md py-sm text-muted-foreground">
                Select a file to preview.
              </Text>
            </Center>
          )}
        </Clip>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
