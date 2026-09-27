import { type ReactNode } from "react";
import {
  Pane,
  PaneChrome,
  defineRoute,
} from "@plugins/primitives/plugins/pane/web";
import { useLive } from "@plugins/network/plugins/live/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { mailApp } from "@plugins/apps/plugins/mail/plugins/shell/core";
import { threadMessages } from "../core";
import { MessageList } from "./components/message-list";

// The reading pane: the second Miller column, opened by selecting a thread in the
// list (`openPane(threadPane, { threadId }, { mode: "push" })`). Exported so the
// threads plugin can reference it for selection + navigation. Registered via
// `Pane.Register` in the default plugin definition (`index.ts`).
export const threadPane = Pane.define({
  route: defineRoute({ id: "mail-thread", segment: "thread/:threadId" }),
  app: mailApp,
  component: ThreadPaneView,
  width: 640,
  // No existence gate: a missing/deleted thread resolves to an empty message
  // list ("(no subject)") rather than a hard 404 — the list only ever opens
  // thread ids it just rendered.
  resolve: false,
});

function ThreadPaneView(): ReactNode {
  const { threadId } = threadPane.useParams();
  // The thread's newest messages (the collection's default window is newest
  // first); `loadMore` grows it backwards in time.
  const result = useLive(threadMessages, { where: { threadId } });

  if (result.pending) {
    return (
      <PaneChrome pane={threadPane} title="Thread">
        {result.error ? (
          <Center axis="both">
            <Placeholder tone="error">Couldn’t load this thread.</Placeholder>
          </Center>
        ) : (
          <Loading variant="rows" />
        )}
      </PaneChrome>
    );
  }

  // The pane reads oldest→newest, so the newest-first window is reversed.
  const messages = [...result.data].reverse();
  // The subject is stable across a thread; the oldest LOADED message carries it
  // (in a thread longer than the window that is a reply, so its "Re:" form).
  const subject = messages[0]?.subject?.trim() || "(no subject)";
  return (
    <PaneChrome pane={threadPane} title={subject}>
      <MessageList messages={messages} older={result} />
    </PaneChrome>
  );
}
