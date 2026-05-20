import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { ActionBarView } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";
import { HeaderView } from "@plugins/conversations/plugins/conversation-view/plugins/header/web";
import { Conversation } from "../slots";
import { conversationPane } from "../panes";
import { PromptInsertProvider } from "../prompt-insert-context";
import { JsonlPane } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";

export function ConversationView() {
  const { conversation } = conversationPane.useData();
  const promptBarItems = Conversation.PromptBar.useContributions();
  const promptInputItems = Conversation.PromptInput.useContributions();
  const abovePromptInputItems = Conversation.AbovePromptInput.useContributions();
  const PromptInputComponent = promptInputItems[0]?.component ?? null;

  const showBottomBar =
    !!PromptInputComponent ||
    promptBarItems.length > 0 ||
    abovePromptInputItems.length > 0;

  return (
    <PaneChrome
      pane={conversationPane}
      title={<HeaderView />}
      hideRightActions
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex items-center border-b px-2 py-1.5">
          <ActionBarView />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <JsonlPane conversation={conversation}>
            {showBottomBar && (
              <PromptInsertProvider>
                <div className="flex shrink-0 flex-col gap-2 border-t border-border px-3 pt-1.5 pb-2">
                  <Conversation.AbovePromptInput.Render>
                    {(item) => <item.component conversation={conversation} />}
                  </Conversation.AbovePromptInput.Render>
                  {PromptInputComponent && (
                    <PromptInputComponent conversation={conversation} />
                  )}
                  {promptBarItems.length > 0 && (
                    <div className="flex justify-end">
                      <div className="flex items-center gap-1.5">
                        <Conversation.PromptBar.Render>
                          {(item) => {
                            const Component = item.component;
                            return <Component conversation={conversation} />;
                          }}
                        </Conversation.PromptBar.Render>
                      </div>
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
