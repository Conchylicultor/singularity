import { useState } from "react";
import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { useLive } from "@plugins/network/plugins/live/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { pushRows } from "@plugins/tasks/plugins/tasks-core/core";
import { Review } from "./slots";
import { type Source, SourceTabs, groupPushes } from "./source";

export const convReviewPane = Pane.define({
  route: defineRoute({
    id: "conv-review",
    segment: "review",
  }),
  app: agentManagerApp,
  // Conversation-scoped satellite: promote() would strip convId from the URL.
  chrome: { promote: false },
  component: ConvReviewBody,
  width: 720,
});

function ConvReviewBody() {
  const convId = conversationPane.useRouteEntry()?.params.convId;
  const conversation = useConversationById(convId ?? null);
  const [source, setSource] = useState<Source>({ kind: "working" });

  if (!convId) return null;

  return (
    <PaneChrome pane={convReviewPane} title="Review">
      <Stack gap="none" className="h-full">
        {conversation ? (
          <AttemptSourceTabs
            attemptId={conversation.attemptId}
            source={source}
            onChange={setSource}
          />
        ) : (
          // The conversation (and so its attempt) is not known yet: its push
          // tabs are too.
          <SourceTabs
            source={source}
            onChange={setSource}
            pushGroups="pending"
          />
        )}
        <Scroll axis="both" fill>
          <Review.Host conversationId={convId} source={source} />
        </Scroll>
      </Stack>
    </PaneChrome>
  );
}

// The source tabs once the attempt is known: one tab per push of THIS attempt,
// read from the `pushes` collection filtered to it (a filter, not a slice of a
// global recent window, so an arbitrarily old attempt keeps its pushes).
function AttemptSourceTabs({
  attemptId,
  source,
  onChange,
}: {
  attemptId: string;
  source: Source;
  onChange: (next: Source) => void;
}) {
  const pushesQ = useLive(pushRows, { where: { attemptId } });
  return (
    <SourceTabs
      source={source}
      onChange={onChange}
      pushGroups={pushesQ.pending ? "pending" : groupPushes(pushesQ.data)}
    />
  );
}
