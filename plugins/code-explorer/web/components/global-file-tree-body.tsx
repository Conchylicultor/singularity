import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { globalFileTreePane } from "../panes";
import { FileTreeView } from "./file-tree-view";

export function GlobalFileTreeBody() {
  const { worktree } = globalFileTreePane.useParams();
  return (
    <Clip fill className="h-full">
      <FileTreeView worktree={worktree} />
    </Clip>
  );
}
