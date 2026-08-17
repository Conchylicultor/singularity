import { useCallback, useMemo } from "react";
import { MdHistory } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useActiveInView } from "@plugins/primitives/plugins/outline/plugins/scroll-spy/web";
import {
  useJsonlConversationId,
  usePaneScrollElement,
  useVisibleEvents,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { jsonlEventsResource } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/core";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { TranscriptStats } from "../slots";
import { TranscriptReadProvider } from "../read-context";
import { StatBadge } from "./stat-badge";

export function TranscriptStatsStrip() {
  const conversationId = useJsonlConversationId();
  if (!conversationId) return null;
  return <Strip conversationId={conversationId} />;
}

function Strip({ conversationId }: { conversationId: string }) {
  const result = useResource(jsonlEventsResource, { id: conversationId });
  // Gate here so the strip below never has to represent "loading" as "an empty
  // transcript" — which every stat would faithfully report as zero.
  if (result.pending) return null;
  return <StripWithEvents events={result.data} />;
}

function StripWithEvents({ events }: { events: JsonlEvent[] }) {
  // This strip is a sibling of the transcript scroller inside the pane frame,
  // not inside it, so the scroller has to be published rather than walked to.
  const scroller = usePaneScrollElement();
  // The DOM numbers rows over the FILTERED transcript, so the anchor comes back
  // in those terms and has to be translated before it can slice the raw one.
  const visible = useVisibleEvents(events);
  // The candidates ARE the rows currently in the transcript, so a torn-out row
  // cannot pin the anchor past the end — no staleness guard needed downstream.
  const ids = useMemo(() => visible.map((_, i) => String(i)), [visible]);
  const resolve = useCallback(
    (id: string) =>
      scroller?.querySelector(`[data-event-index="${CSS.escape(id)}"]`) ?? null,
    [scroller],
  );
  const anchorId = useActiveInView(ids, resolve, { position: "furthest-read" });
  const anchor = anchorId === null ? null : Number(anchorId);

  const read = useMemo(() => {
    const anchorEvent = anchor === null ? undefined : visible[anchor];
    // No anchor yet (first paint) or a row that is no longer in the transcript:
    // the honest answer is the whole thing, which is also what the strip showed
    // before it could follow the reader at all.
    if (!anchorEvent) return { events, atEnd: true };
    // Identity, not position: `visible` is a subsequence of `events` sharing its
    // element references, so this is exact where an index would be off by every
    // hidden row before it.
    const rawIndex = events.indexOf(anchorEvent);
    if (rawIndex < 0) return { events, atEnd: true };
    const atEnd = rawIndex === events.length - 1;
    return { events: atEnd ? events : events.slice(0, rawIndex + 1), atEnd };
  }, [events, visible, anchor]);

  return (
    <Pin to="bottom" stretch offset="sm" layer="raised" decorative>
      <Stack
        direction="row"
        justify="end"
        align="center"
        gap="xs"
        className="mx-auto max-w-reading px-md"
      >
        {/* Scrolled back into history, the numbers beside this are no longer
            the conversation's totals — they are what they were at the row on
            screen. Without something saying so, a reader who scrolls up just
            sees the counters move for no reason. */}
        {!read.atEnd && (
          <StatBadge title="Showing the transcript up to the last row on screen. Scroll to the end for the totals.">
            <MdHistory className="size-3" />
          </StatBadge>
        )}
        <TranscriptReadProvider value={read}>
          <TranscriptStats.Item.Render />
        </TranscriptReadProvider>
      </Stack>
    </Pin>
  );
}
