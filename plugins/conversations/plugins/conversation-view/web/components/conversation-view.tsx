import { useEffect } from "react";
import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { markConversationViewed } from "@plugins/conversations/plugins/hibernation/web";
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
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";

export function ConversationView() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);

  // Selection signal for idle hibernation: opening (or switching to) a
  // conversation resets its idle timer and transparently resumes it if it was
  // hibernated. Fire-and-forget — failure here must not block rendering the
  // transcript (which renders from disk, independent of the live process).
  useEffect(() => {
    void markConversationViewed(convId);
  }, [convId]);

  const promptBarItems = Conversation.PromptBar.useContributions();
  const promptInputItems = Conversation.PromptInput.useContributions();
  const abovePromptInputItems = Conversation.AbovePromptInput.useContributions();

  const showBottomBar =
    promptInputItems.length > 0 ||
    promptBarItems.length > 0 ||
    abovePromptInputItems.length > 0;

  if (!conversation) {
    return (
      <Center axis="both" className="h-full p-xl">
        <Loading />
      </Center>
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
      <Clip fill as={Stack} className="h-full">
        <Stack direction="row" gap="none" align="center" className="border-b px-sm py-xs">
          <ActionBarView />
        </Stack>
        <Clip fill>
          <JsonlPane conversation={conversation}>
            {showBottomBar && (
              <PromptInsertProvider>
                {/* eslint-disable-next-line layout/no-adhoc-layout -- rigid bottom bar: must not shrink under the scrolling transcript above; lone shrink-0 block has no container primitive */}
                <div className="shrink-0">
                <Stack gap="sm" className="mx-auto max-w-reading px-md pt-xs pb-sm">
                  <Conversation.AbovePromptInput.Render>
                    {(item) => <item.component conversation={conversation} />}
                  </Conversation.AbovePromptInput.Render>
                  <Conversation.PromptInput.Render>
                    {(item) => <item.component conversation={conversation} />}
                  </Conversation.PromptInput.Render>
                  {promptBarItems.length > 0 && (
                    <Stack direction="row" gap="none" justify="end">
                      <Stack direction="row" gap="xs" align="center">
                        <Conversation.PromptBar.Render>
                          {(item) => {
                            const Component = item.component;
                            return <Component conversation={conversation} />;
                          }}
                        </Conversation.PromptBar.Render>
                      </Stack>
                    </Stack>
                  )}
                </Stack>
                </div>
              </PromptInsertProvider>
            )}
          </JsonlPane>
        </Clip>
      </Clip>
    </PaneChrome>
    </>
  );
}
