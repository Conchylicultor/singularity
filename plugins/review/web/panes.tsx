import { useMemo, useState } from "react";
import { Pane, PaneChrome, type } from "@plugins/primitives/plugins/pane/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { pushesResource } from "@plugins/tasks/core";
import { Review } from "./slots";
import { type Source, SourceTabs, groupPushes } from "./source";

export const convReviewPane = Pane.define({
  id: "conv-review",
  segment: "review",
  input: type<{ convId: string }>(),
  component: ConvReviewBody,
  width: 720,
});

function ConvReviewBody() {
  const { convId: inputConvId } = convReviewPane.useInput();
  const routeEntry = conversationPane.useRouteEntry();
  const convId = inputConvId ?? routeEntry?.params.convId;
  const conversation = useConversationById(convId ?? null);
  const [source, setSource] = useState<Source>({ kind: "working" });

  const pushesQ = useResource(pushesResource);
  const pushGroups = useMemo(() => {
    if (pushesQ.pending || !conversation) return [];
    const rows = pushesQ.data.filter(
      (p) => p.attemptId === conversation.attemptId,
    );
    return groupPushes(rows);
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
