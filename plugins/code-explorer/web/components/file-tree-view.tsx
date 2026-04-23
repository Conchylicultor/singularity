import { useEffect, useState } from "react";
import { FilePaneView } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web/components/file-pane";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { FileTree } from "./file-tree";

type TreeState =
  | { kind: "loading" }
  | { kind: "ok"; files: string[] }
  | { kind: "error"; message: string };

interface FileTreeViewProps {
  worktree: string;
}

export function FileTreeView({ worktree }: FileTreeViewProps) {
  const [state, setState] = useState<TreeState>({ kind: "loading" });
  const [selectedPath, setSelectedPath] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    setSelectedPath("");
    fetch(`/api/code/${encodeURIComponent(worktree)}/tree`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setState({
            kind: "error",
            message: text || `Failed to load tree (${res.status})`,
          });
          return;
        }
        const body = (await res.json()) as { files: string[] };
        setState({ kind: "ok", files: body.files });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ kind: "error", message: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [worktree]);

  return (
    <ResizablePanelGroup
      orientation="horizontal"
      className="h-full"
      id="code-explorer-group"
    >
      <ResizablePanel id="tree" defaultSize={25} minSize={15}>
        <div className="h-full min-h-0 overflow-auto border-r">
          {state.kind === "loading" ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Loading…
            </div>
          ) : state.kind === "error" ? (
            <div className="px-3 py-2 text-sm text-destructive">
              {state.message}
            </div>
          ) : state.files.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No files.
            </div>
          ) : (
            <FileTree
              files={state.files}
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
