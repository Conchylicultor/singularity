import { Outlet, usePaneMatch } from "@plugins/primitives/plugins/pane/web";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { yakShavingConversationPane } from "../panes";
import { RebuildButton } from "./rebuild-button";
import { YakTree } from "./yak-tree";

export function YakShavingRoot() {
  const match = usePaneMatch();
  const selectedConvId = match?.chain.find(
    (e) => e.pane === yakShavingConversationPane._internal,
  )?.params.convId;
  const hasConvSelected = selectedConvId != null;

  return (
    <div className="h-[calc(100svh-3rem)] min-h-0 overflow-hidden">
      <ResizablePanelGroup orientation="horizontal" className="h-full">
        <ResizablePanel defaultSize={45} minSize={25}>
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <div className="text-sm font-medium">Yak shaving</div>
              <RebuildButton />
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-2">
              <YakTree selectedConvId={selectedConvId} />
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={55} minSize={25}>
          {hasConvSelected ? (
            <Outlet />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-sm">
              Select a conversation
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
