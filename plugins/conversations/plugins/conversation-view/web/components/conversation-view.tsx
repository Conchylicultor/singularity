import { Outlet, PaneChrome, usePaneMatch } from "@plugins/primitives/plugins/pane/web";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Conversation, type ConversationRecord } from "../slots";
import { conversationPane, isMainPaneId } from "../panes";
import { PromptDraftProvider } from "../prompt-draft-context";
import { JsonlPane } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { useConversation, useConversationById } from "@plugins/conversations/web";

type PromptBarItem = ReturnType<typeof Conversation.PromptBar.useContributions>[number];

function PromptBar({
  items,
  conversation,
}: {
  items: PromptBarItem[];
  conversation: ConversationRecord;
}) {
  const sections = items.reduce<Map<string, { order: number; items: PromptBarItem[] }>>(
    (acc, item) => {
      const entry = acc.get(item.section) ?? { order: item.sectionOrder ?? 0, items: [] };
      entry.items.push(item);
      acc.set(item.section, entry);
      return acc;
    },
    new Map(),
  );
  const sorted = [...sections.entries()].sort(([, a], [, b]) => a.order - b.order);

  return (
    <div className="flex items-center gap-2">
      {sorted.map(([section, { items: sectionItems }], idx) => (
        <div key={section} className="flex items-center gap-1.5">
          {idx > 0 && <div className="h-5 w-px bg-border" />}
          {sectionItems.map((item, i) => {
            const Component = item.component;
            return <Component key={i} conversation={conversation} />;
          })}
        </div>
      ))}
    </div>
  );
}

export function ConversationView({ sessionId }: { sessionId: string }) {
  const promptBarItems = Conversation.PromptBar.useContributions();
  const promptInputItems = Conversation.PromptInput.useContributions();
  const PromptInputComponent = promptInputItems[0]?.component ?? null;
  // useConversation subscribes to the live WebSocket resource (recentConversationsResource),
  // so status updates (starting → working → done) are reflected in real time.
  // Fall back to the point-lookup only for older conversations outside the recent window.
  const liveConversation = useConversation(sessionId);
  const fetchedConversation = useConversationById(liveConversation ? null : sessionId);
  const conversation = liveConversation ?? fetchedConversation;

  // Decide layout from the current pane match. When conversationPane is the
  // leaf, there's no sub-pane — just the JSONL view fills the area. When a
  // main sub-pane (e.g. review) is active, render the Outlet full-height.
  // Otherwise we have a side sub-pane (terminal/docs/tasks) — split JSONL
  // and Outlet.
  const match = usePaneMatch();
  const convEntry = match?.chain.find((e) => e.pane === conversationPane._internal);
  const leafPane = match?.chain[match.chain.length - 1]?.pane;
  const isConvActive = !!convEntry;
  const hasSubPane = isConvActive && leafPane !== conversationPane._internal;
  const isMain = hasSubPane && !!leafPane && isMainPaneId(leafPane.id);

  const showBottomBar =
    !!conversation && (!!PromptInputComponent || promptBarItems.length > 0);

  const mainBlock = conversation && (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        <JsonlPane conversation={conversation} />
      </div>
      {showBottomBar && (
        <div className="flex shrink-0 flex-col gap-2 border-t border-border px-3 pt-1.5 pb-2">
          {PromptInputComponent && (
            <PromptInputComponent conversation={conversation} />
          )}
          {promptBarItems.length > 0 && (
            <div className="flex justify-end">
              <PromptBar items={promptBarItems} conversation={conversation} />
            </div>
          )}
        </div>
      )}
    </div>
  );

  const mainAndSide = (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize={hasSubPane ? 55 : 100} minSize={20}>
        {mainBlock}
      </ResizablePanel>
      {hasSubPane && (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={45} minSize={25}>
            <Outlet />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );

  // Sub-panes call `conversationPane.useData()`, so don't mount them until
  // the conversation is loaded (and the Provider below is wrapping).
  const mainArea =
    !conversation ? (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Loading conversation…
      </div>
    ) : isMain ? (
      <Outlet />
    ) : (
      mainAndSide
    );

  const body = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">{mainArea}</div>
    </div>
  );

  if (!conversation) {
    return <PromptDraftProvider>{body}</PromptDraftProvider>;
  }
  // Main sub-panes (e.g. Review, Files) replace the main area entirely and
  // render their own PaneChrome; suppress the parent chrome so we don't
  // stack two headers.
  return (
    <PromptDraftProvider>
      <conversationPane.Provider value={{ conversation }}>
        {isMain ? (
          body
        ) : (
          <PaneChrome
            pane={conversationPane}
            title={conversation.title ?? conversation.id}
          >
            {body}
          </PaneChrome>
        )}
      </conversationPane.Provider>
    </PromptDraftProvider>
  );
}
