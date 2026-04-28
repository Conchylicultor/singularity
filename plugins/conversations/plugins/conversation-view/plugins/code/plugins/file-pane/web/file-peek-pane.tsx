import { MdClose } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { FilePaneView } from "./components/file-pane";

export const convFilePeekPane = Pane.define({
  id: "conv-file-peek",
  parent: conversationPane,
  path: "file/:worktree/:filePath*",
  component: ConvFilePeekPaneBody,
});

function ConvFilePeekPaneBody() {
  const { worktree, filePath } = convFilePeekPane.useParams();
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
        <FilePaneView worktree={worktree} path={filePath} status="clean" />
      </div>
    </div>
  );
}
