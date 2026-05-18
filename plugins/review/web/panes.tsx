import { useMemo, useState } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { pushesResource } from "@plugins/tasks/core";
import { Review } from "./slots";
import { type Source, SourceTabs, groupPushes } from "./source";

export const convReviewPane = Pane.define({
  id: "conv-review",
  after: [conversationPane],
  segment: "review",
  component: ConvReviewBody,
  width: 720,
});

function ConvReviewBody() {
  const { conversation: paneConversation } = conversationPane.useData();
  const conversation = useConversationById(paneConversation.id);
  const [source, setSource] = useState<Source>({ kind: "working" });

  const pushesQ = useResource(pushesResource);
  const pushGroups = useMemo(() => {
    if (pushesQ.pending || !conversation) return [];
    const rows = pushesQ.data.filter(
      (p) => p.attemptId === conversation.attemptId,
    );
    return groupPushes(rows);
  }, [pushesQ, conversation]);

  return (
    <PaneChrome pane={convReviewPane} title="Review">
      <div className="flex h-full flex-col">
        <SourceTabs
          source={source}
          onChange={setSource}
          pushGroups={pushGroups}
        />
        <div className="min-h-0 flex-1 overflow-auto">
          <Review.Host conversationId={paneConversation.id} source={source} />
        </div>
      </div>
    </PaneChrome>
  );
}
