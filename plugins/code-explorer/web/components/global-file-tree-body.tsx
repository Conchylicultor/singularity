import { globalFileTreePane } from "../panes";
import { FileTreeView } from "./file-tree-view";

export function GlobalFileTreeBody() {
  const { worktree } = globalFileTreePane.useParams();
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <FileTreeView worktree={worktree} />
    </div>
  );
}
