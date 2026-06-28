import type { ReactElement } from "react";
import { useResource, matchResource } from "@plugins/primitives/plugins/live-state/web";
import { Pane, PaneChrome, useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { DataView, defineDataView } from "@plugins/primitives/plugins/data-view/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import type { Conversation } from "@plugins/tasks/plugins/tasks-core/core";
import { conversationsRevisionResource, queryConversations } from "../core";
import { conversationFieldDefs } from "./internal/fields";

const ALL_CONVERSATIONS_VIEW = defineDataView("all-conversations");

export const allConversationsPane = Pane.define({
  id: "all-conversations",
  segment: "all-conversations",
  component: AllConversationsView,
  width: 720,
});

function AllConversationsView(): ReactElement {
  // The cheap scalar tick drives an in-place refetch of the loaded window; the
  // paginated SQL query is the source of truth. While pending, hand a null tick
  // (no refetch) — the first settled `rev` then refreshes once.
  const tick = useResource(conversationsRevisionResource);
  const openPane = useOpenPane();
  const changeTick = matchResource(tick, {
    pending: () => null,
    ready: (d) => d.rev,
  });

  return (
    <PaneChrome pane={allConversationsPane} title="All conversations">
      <DataView<Conversation>
        storageKey={ALL_CONVERSATIONS_VIEW}
        rows={[]}
        fields={conversationFieldDefs}
        rowKey={(c) => c.id}
        views={["table", "list"]}
        dataSource={{
          changeTick,
          fetchPage: (args) => fetchEndpoint(queryConversations, {}, { body: args }),
        }}
        onRowActivate={(c) =>
          openPane(conversationPane, { convId: c.id }, { mode: "push" })
        }
      />
    </PaneChrome>
  );
}
