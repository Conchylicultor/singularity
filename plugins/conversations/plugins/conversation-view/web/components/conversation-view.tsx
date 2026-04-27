import { useEffect, useMemo, useRef, useState } from "react";
import { Outlet, PaneChrome, usePaneMatch } from "@plugins/pane/web";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Conversation, type ConversationRecord } from "../slots";
import { conversationPane, isMainPaneId } from "../panes";
import { PromptDraftProvider } from "../prompt-draft-context";
import { terminalPane } from "@plugins/terminal/web";
import { useConversation, useConversationById } from "@plugins/conversations/web";

const TMUX = "/opt/homebrew/bin/tmux";

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
  // leaf, there's no sub-pane — just show the terminal. When a main sub-pane
  // (e.g. review) is active, render the Outlet full-height. Otherwise we have
  // a side sub-pane (docs/tasks/jsonl) — split terminal and Outlet.
  const match = usePaneMatch();
  const convEntry = match?.chain.find((e) => e.pane === conversationPane._internal);
  const leafPane = match?.chain[match.chain.length - 1]?.pane;
  const isConvActive = !!convEntry;
  const hasSubPane = isConvActive && leafPane !== conversationPane._internal;
  const isMain = hasSubPane && !!leafPane && isMainPaneId(leafPane.id);

  const TerminalComponent = useMemo(
    () =>
      terminalPane({
        command: [TMUX, "-u", "attach", "-t", sessionId],
        title: sessionId,
      }).component,
    [sessionId],
  );

  // The terminal mounts `tmux attach` once. After Resume re-spawns the pane,
  // the existing PTY (which exited when the original session died) has to be
  // replaced — bump a key whenever the conversation transitions from gone to
  // live so the TerminalComponent remounts and reattaches.
  const liveStatus = conversation?.status;
  const [reattachKey, setReattachKey] = useState(0);
  const wasGoneRef = useRef(liveStatus === "gone");
  useEffect(() => {
    if (wasGoneRef.current && liveStatus && liveStatus !== "gone") {
      setReattachKey((k) => k + 1);
    }
    wasGoneRef.current = liveStatus === "gone";
  }, [liveStatus]);

  const showBottomBar =
    !!conversation && (!!PromptInputComponent || promptBarItems.length > 0);

  const terminalBlock = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        <TerminalComponent key={reattachKey} />
      </div>
      {showBottomBar && conversation && (
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

  // Keep ResizablePanelGroup's first Panel structurally identical between the
  // "no sub-pane" and "side sub-pane" states so React preserves the terminal
  // instance across toggles (xterm + tmux attach would otherwise re-mount).
  const terminalAndSide = (
    <ResizablePanelGroup orientation="horizontal" className="h-full">
      <ResizablePanel defaultSize={hasSubPane ? 55 : 100} minSize={20}>
        {terminalBlock}
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
    hasSubPane && !conversation ? (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Loading conversation…
      </div>
    ) : isMain ? (
      <Outlet />
    ) : (
      terminalAndSide
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
