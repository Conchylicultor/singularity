import { type ReactElement } from "react";
import { threadPane } from "@plugins/apps/plugins/mail/plugins/reading-pane/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { VirtualRows } from "@plugins/primitives/plugins/virtual-rows/web";
import { InfiniteScrollFooter } from "@plugins/primitives/plugins/cursor-pagination/web";
import { useThreadList } from "../internal/use-thread-list";
import { ThreadRow } from "./thread-row";

// Roughly two text lines + padding; dynamic measurement refines it after mount.
const ROW_ESTIMATE_PX = 60;

/**
 * The windowed, live thread list for one mailbox view — the body of
 * `mailboxViewPane`. Renders a skeleton on first load, a friendly empty state
 * when the view has no threads, else the virtualized rows with an
 * IntersectionObserver sentinel that pulls the next keyset page as it nears view.
 */
export function MailThreadList({ view }: { view: string }): ReactElement {
  const { items, isPending, scroll } = useThreadList(view);
  const selectedThreadId = threadPane.useRouteEntry()?.params.threadId;

  if (isPending) {
    return (
      <Scroll axis="y" fill>
        <Loading variant="rows" />
      </Scroll>
    );
  }

  if (items.length === 0) {
    return (
      <Center axis="both" className="min-h-full">
        <Placeholder tone="muted">Nothing here yet.</Placeholder>
      </Center>
    );
  }

  return (
    <Scroll axis="y" fill>
      <VirtualRows
        items={items}
        estimateSize={ROW_ESTIMATE_PX}
        getKey={(thread) => thread.id}
      >
        {(thread) => (
          <ThreadRow thread={thread} selected={thread.id === selectedThreadId} />
        )}
      </VirtualRows>
      <InfiniteScrollFooter handle={scroll} />
    </Scroll>
  );
}
