import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { ActionBarView } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";
import { Conversation, type ConversationRecord } from "../slots";
import { conversationPane } from "../panes";
import { JsonlPane } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";

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

/**
 * Visual body of the conversation pane. Reads the loaded conversation from
 * `conversationPane.useData()` (provided by `ConversationProvide` either at
 * the chain level via Miller or wrapped explicitly by an embedding host).
 */
export function ConversationView() {
  const { conversation } = conversationPane.useData();
  const promptBarItems = Conversation.PromptBar.useContributions();
  const promptInputItems = Conversation.PromptInput.useContributions();
  const abovePromptInputItems = Conversation.AbovePromptInput.useContributions();
  const titlePrefixItems = Conversation.TitlePrefix.useContributions();
  const PromptInputComponent = promptInputItems[0]?.component ?? null;

  const showBottomBar =
    !!PromptInputComponent ||
    promptBarItems.length > 0 ||
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
              <div className="flex shrink-0 flex-col gap-2 border-t border-border px-3 pt-1.5 pb-2">
                {abovePromptInputItems.map((item, i) => {
                  const Cmp = item.component;
                  return <Cmp key={i} conversation={conversation} />;
                })}
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
          </JsonlPane>
        </div>
      </div>
    </PaneChrome>
  );
}
