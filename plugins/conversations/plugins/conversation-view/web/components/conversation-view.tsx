import { useMemo } from "react";
import type { ComponentType } from "react";
import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { PluginErrorBoundary } from "@plugins/primitives/plugins/error-boundary/web";
import { Reorder, type UseAreaResult } from "@plugins/reorder/web";
import { ActionBarView } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";
import { Conversation, type ConversationRecord } from "../slots";
import { conversationPane } from "../panes";
import { PromptInsertProvider } from "../prompt-insert-context";
import { JsonlPane } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";

type PromptBarItem = {
  id: string;
  excludeFromReorder?: boolean;
  section: string;
  sectionOrder?: number;
  component: ComponentType<{ conversation: ConversationRecord }>;
};

function PromptBar({
  area,
  conversation,
}: {
  area: UseAreaResult<PromptBarItem>;
  conversation: ConversationRecord;
}) {
  // Sections inside the PromptBar are externally ordered by `sectionOrder`;
  // items within a section are reorderable by user via the rank.
  const sections = useMemo(() => {
    const map = new Map<string, { order: number; items: typeof area.items }>();
    for (const item of area.items) {
      const entry = map.get(item.section) ?? {
        order: item.sectionOrder ?? 0,
        items: [],
      };
      entry.items.push(item);
      map.set(item.section, entry);
    }
    return [...map.entries()].sort(([, a], [, b]) => a.order - b.order);
  }, [area]);

  return (
    <area.DndWrapper>
      <div className="flex items-center gap-2">
        {sections.map(([section, { items: sectionItems }], idx) => (
          <div key={section} className="flex items-center gap-1.5">
            {idx > 0 && <div className="h-5 w-px bg-border" />}
            {sectionItems.map((item) => {
              const Component = item.component;
              return (
                <area.ReorderItem key={item.id} item={item}>
                  <PluginErrorBoundary slot={Conversation.PromptBar.id}>
                    <Component conversation={conversation} />
                  </PluginErrorBoundary>
                </area.ReorderItem>
              );
            })}
          </div>
        ))}
      </div>
    </area.DndWrapper>
  );
}

/**
 * Visual body of the conversation pane. Reads the loaded conversation from
 * `conversationPane.useData()` (provided by `ConversationProvide` either at
 * the chain level via Miller or wrapped explicitly by an embedding host).
 */
export function ConversationView() {
  const { conversation } = conversationPane.useData();
  const promptBar = Reorder.useArea(Conversation.PromptBar);
  const promptInputItems = Conversation.PromptInput.useContributions();
  const abovePromptInputItems = Conversation.AbovePromptInput.useContributions();
  const titlePrefixItems = Conversation.TitlePrefix.useContributions();
  const PromptInputComponent = promptInputItems[0]?.component ?? null;

  const showBottomBar =
    !!PromptInputComponent ||
    promptBar.items.length > 0 ||
    abovePromptInputItems.length > 0;

  return (
    <PaneChrome
      pane={conversationPane}
      title={
        titlePrefixItems.length > 0 ? (
          <span className="flex items-center gap-2">
            {titlePrefixItems.map((item, i) => {
              const Cmp = item.component;
              return <Cmp key={i} conversation={conversation} />;
            })}
            <span className="truncate">{conversation.title ?? conversation.id}</span>
          </span>
        ) : (
          conversation.title ?? conversation.id
        )
      }
      hideRightActions
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden">
          <JsonlPane conversation={conversation} actions={<ActionBarView />}>
            {showBottomBar && (
              <PromptInsertProvider>
                <div className="flex shrink-0 flex-col gap-2 border-t border-border px-3 pt-1.5 pb-2">
                  <Conversation.AbovePromptInput.Render>
                    {(item) => <item.component conversation={conversation} />}
                  </Conversation.AbovePromptInput.Render>
                  {PromptInputComponent && (
                    <PromptInputComponent conversation={conversation} />
                  )}
                  {promptBar.items.length > 0 && (
                    <div className="flex justify-end">
                      <PromptBar area={promptBar} conversation={conversation} />
                    </div>
                  )}
                </div>
              </PromptInsertProvider>
            )}
          </JsonlPane>
        </div>
      </div>
    </PaneChrome>
  );
}
