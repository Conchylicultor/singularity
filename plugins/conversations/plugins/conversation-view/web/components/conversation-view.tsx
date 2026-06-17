import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { ActionBarView } from "@plugins/conversations/plugins/conversation-view/plugins/action-bar/web";
import { HeaderView } from "@plugins/conversations/plugins/conversation-view/plugins/header/web";
import { useConversationById } from "@plugins/conversations/web";
import { Conversation } from "../slots";
import { conversationPane } from "../panes";
import { PromptInsertProvider } from "../prompt-insert-context";
import { ActiveRelateSync } from "./active-relate-sync";
import { JsonlPane } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

export function ConversationView() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const promptBarItems = Conversation.PromptBar.useContributions();
  const promptInputItems = Conversation.PromptInput.useContributions();
  const abovePromptInputItems = Conversation.AbovePromptInput.useContributions();

  const showBottomBar =
    promptInputItems.length > 0 ||
    promptBarItems.length > 0 ||
    abovePromptInputItems.length > 0;

  if (!conversation) {
    return (
      <Loading className="flex h-full items-center justify-center p-xl" />
    );
  }

  return (
    <>
    <ActiveRelateSync />
    <PaneChrome
      pane={conversationPane}
      title={<HeaderView />}
      hideRightActions
      headerSpill
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex items-center border-b px-sm py-xs">
          <ActionBarView />
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <JsonlPane conversation={conversation}>
            {showBottomBar && (
              <PromptInsertProvider>
                <div className="shrink-0">
                <Stack gap="sm" className="mx-auto max-w-reading px-md pt-xs pb-sm">
                  <Conversation.AbovePromptInput.Render>
                    {(item) => <item.component conversation={conversation} />}
                  </Conversation.AbovePromptInput.Render>
                  <Conversation.PromptInput.Render>
                    {(item) => <item.component conversation={conversation} />}
                  </Conversation.PromptInput.Render>
                  {promptBarItems.length > 0 && (
                    <div className="flex justify-end">
                      <div className="flex items-center gap-xs">
                        <Conversation.PromptBar.Render>
                          {(item) => {
                            const Component = item.component;
                            return <Component conversation={conversation} />;
                          }}
                        </Conversation.PromptBar.Render>
                      </div>
                    </div>
                  )}
                </Stack>
                </div>
              </PromptInsertProvider>
            )}
          </JsonlPane>
        </div>
      </div>
    </PaneChrome>
    </>
  );
}
