import { useMemo } from "react";
import { MdFormatListNumbered, MdKeyboardArrowDown } from "react-icons/md";
import {
  FloatingAction,
  FloatingActionFadeIn,
} from "@plugins/primitives/plugins/floating-action/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { jsonlEventsResource } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/core";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";

interface UserEntry {
  eventIndex: number;
  userIndex: number;
  text: string;
  at: string;
}

function extractUserEntries(events: JsonlEvent[]): UserEntry[] {
  const entries: UserEntry[] = [];
  let userIndex = 0;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]!;
    if (ev.kind === "user-text") {
      entries.push({
        eventIndex: i,
        userIndex: ++userIndex,
        text: ev.text,
        at: ev.at,
      });
    }
  }
  return entries;
}

const MAX_PREVIEW = 50;

function truncate(text: string): string {
  const firstLine = text.split("\n", 1)[0] ?? "";
  if (firstLine.length <= MAX_PREVIEW) return firstLine;
  return firstLine.slice(0, MAX_PREVIEW) + "…";
}

// The scroll container is a sibling of this overlay within the pane frame, not a
// global. Walk up from the clicked element to the nearest ancestor whose subtree
// holds a [data-pane-scroll] so a second open conversation pane can't be targeted.
function paneScrollFrom(from: Element): HTMLElement | null {
  let cur: Element | null = from.parentElement;
  while (cur) {
    const scroll = cur.querySelector<HTMLElement>("[data-pane-scroll]");
    if (scroll) return scroll;
    cur = cur.parentElement;
  }
  return null;
}

export function MessageToc() {
  const { convId } = conversationPane.useParams();
  const result = useResource(jsonlEventsResource, { id: convId });
  const entries = useMemo(() => result.pending ? [] : extractUserEntries(result.data), [result]);

  if (entries.length === 0) return null;

  const scrollTo = (eventIndex: number, from: Element) => {
    const scroll = paneScrollFrom(from);
    const el = scroll?.querySelector(`[data-event-index="${eventIndex}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <FloatingAction
      className="absolute top-2 right-3 z-nav"
      anchor="top-right"
      panelClassName="flex-col w-[3.25rem] group-data-hovered/fa:w-56 max-h-[1.625rem] group-data-hovered/fa:max-h-80"
    >
      <div className="flex shrink-0 items-center gap-1.5 px-2 py-1 group-data-hovered/fa:border-b group-data-hovered/fa:border-border/40">
        <MdFormatListNumbered className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
          {entries.length}
        </span>
        <span className="ml-auto text-[10px] font-medium tracking-wide text-muted-foreground opacity-0 transition-opacity duration-150 group-data-hovered/fa:opacity-100">
          messages
        </span>
      </div>

      <FloatingActionFadeIn className="min-h-0 flex-1 overflow-y-auto">
        {entries.map((entry) => (
          <button
            key={entry.eventIndex}
            type="button"
            onClick={(e) => scrollTo(entry.eventIndex, e.currentTarget)}
            className="flex w-full items-start gap-2 px-2 py-1.5 text-left text-xs hover:bg-accent"
          >
            <span className="shrink-0 tabular-nums text-muted-foreground">
              #{entry.userIndex}
            </span>
            <span className="min-w-0 flex-1 truncate text-foreground/80">
              {truncate(entry.text)}
            </span>
          </button>
        ))}
      </FloatingActionFadeIn>

      <FloatingActionFadeIn className="shrink-0">
        <button
          type="button"
          onClick={(e) => {
            const container = paneScrollFrom(e.currentTarget);
            container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
          }}
          className="flex w-full items-center justify-center border-t border-border/40 py-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <MdKeyboardArrowDown className="size-4" />
        </button>
      </FloatingActionFadeIn>
    </FloatingAction>
  );
}
