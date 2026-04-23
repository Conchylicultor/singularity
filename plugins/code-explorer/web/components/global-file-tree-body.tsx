import { globalFileTreePane } from "../panes";
import { FileTreeView } from "./file-tree-view";

export function GlobalFileTreeBody() {
  const { worktree } = globalFileTreePane.useParams();
  return (
    <div className="h-[calc(100svh-3rem)] min-h-0 overflow-hidden">
      <FileTreeView worktree={worktree} />
    </div>
  );
}
