import { type ReactNode } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { useResource, matchResource } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { threadMessagesResource } from "../core";
import { MessageList } from "./components/message-list";

// The reading pane: the second Miller column, opened by selecting a thread in the
// list (`openPane(threadPane, { threadId }, { mode: "push" })`). Exported so the
// thread-list plugin can reference it for selection + navigation. Registered via
// `Pane.Register` in the default plugin definition (`index.ts`).
export const threadPane = Pane.define({
  id: "mail-thread",
  segment: "thread/:threadId",
  component: ThreadPaneView,
  width: 640,
  // No existence gate: a missing/deleted thread resolves to an empty message
  // list ("(no subject)") rather than a hard 404 — the list only ever opens
  // thread ids it just rendered.
  resolve: false,
});

function ThreadPaneView(): ReactNode {
  const { threadId } = threadPane.useParams();
  const result = useResource(threadMessagesResource, { threadId });

  return matchResource(result, {
    pending: () => (
      <PaneChrome pane={threadPane} title="Thread">
        <Loading variant="rows" />
      </PaneChrome>
    ),
    error: () => (
      <PaneChrome pane={threadPane} title="Thread">
        <Center axis="both">
          <Placeholder tone="error">Couldn’t load this thread.</Placeholder>
        </Center>
      </PaneChrome>
    ),
    ready: (messages) => {
      // The subject is stable across a thread; the first message carries it.
      const subject = messages[0]?.subject?.trim() || "(no subject)";
      return (
        <PaneChrome pane={threadPane} title={subject}>
          <MessageList messages={messages} />
        </PaneChrome>
      );
    },
  });
}
