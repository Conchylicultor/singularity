import { MdClose } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { FilePaneView } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { convFilePeekPane } from "../panes";

export function ConvFilePeekPane() {
  const { filePath } = convFilePeekPane.useParams();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          title="Close"
          aria-label="Close file preview"
          onClick={() => convFilePeekPane.close()}
        >
          <MdClose className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <FilePaneView worktree="main" path={filePath} status="clean" />
      </div>
    </div>
  );
}
