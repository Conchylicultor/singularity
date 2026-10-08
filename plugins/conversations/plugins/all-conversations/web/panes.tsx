import type { ReactElement } from "react";
import {
  Pane,
  PaneChrome,
  useOpenPane,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import {
  DataView,
  defineDataView,
  defineFieldExtensions,
  liveDataSource,
} from "@plugins/primitives/plugins/data-view/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import {
  allConversations,
  CONVERSATION_SEARCHABLE,
  type ConversationListLiveRow,
} from "../core";
import { useConversationFieldDefs } from "./internal/fields";

/** The surface id — and `allConversations`' column scope (asserted at mount). */
const ALL_CONVERSATIONS_VIEW = defineDataView("all-conversations");

/**
 * The live source: the `conversations.all` collection, kept fresh by the routed
 * change feed (a conversation write, an attempt's move, a task rename) with no
 * tick and no refetch of the loaded pages.
 */
const allConversationsSource = liveDataSource(allConversations, {
  searchable: CONVERSATION_SEARCHABLE,
});

/**
 * Fields other plugins add to the All-conversations list — typically bound to
 * their contributed columns of `conversations.all` (read off `$columns`), so
 * the list sorts and filters by them server-side.
 */
export const AllConversationsFields =
  defineFieldExtensions<ConversationListLiveRow>();

export const allConversationsPane = Pane.define({
  route: defineRoute({
    id: "all-conversations",
    segment: "all-conversations",
  }),
  app: agentManagerApp,
  title: "Conversations",
  component: AllConversationsView,
  width: 720,
});

function AllConversationsView(): ReactElement {
  const openPane = useOpenPane();
  const fields = useConversationFieldDefs();

  return (
    <PaneChrome pane={allConversationsPane}>
      <DataView<ConversationListLiveRow>
        storageKey={ALL_CONVERSATIONS_VIEW}
        fields={fields}
        fieldExtensions={AllConversationsFields}
        views={["table", "list"]}
        source={allConversationsSource}
        rowActivation={(c) =>
          openPane.to(conversationPane, { convId: c.id }, { mode: "push" })
        }
      />
    </PaneChrome>
  );
}
