import { useMemo, useState } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { pushesByAttemptResource } from "@plugins/tasks/plugins/tasks-core/core";
import { Review } from "./slots";
import { type Source, SourceTabs, groupPushes } from "./source";

export const convReviewPane = Pane.define({
  id: "conv-review",
  segment: "review",
  // Conversation-scoped satellite: promote() would strip convId from the URL.
  chrome: { promote: false },
  component: ConvReviewBody,
  width: 720,
});

function ConvReviewBody() {
  const convId = conversationPane.useRouteEntry()?.params.convId;
  const conversation = useConversationById(convId ?? null);
  const [source, setSource] = useState<Source>({ kind: "working" });

  // Per-attempt bounded sub — correct for arbitrarily old attempts, unlike
  // filtering the global recent-push window (which dropped an old attempt's pushes).
  const pushesQ = useResource(pushesByAttemptResource, {
    attemptId: conversation?.attemptId ?? "",
  });
  const pushGroups = useMemo(() => {
    if (pushesQ.pending || !conversation) return [];
    return groupPushes(pushesQ.data);
  }, [pushesQ, conversation]);

  if (!convId) return null;

  return (
    <PaneChrome pane={convReviewPane} title="Review">
      <Stack gap="none" className="h-full">
        <SourceTabs
          source={source}
          onChange={setSource}
          pushGroups={pushGroups}
        />
        <Scroll axis="both" fill>
          <Review.Host conversationId={convId} source={source} />
        </Scroll>
      </Stack>
    </PaneChrome>
  );
}
