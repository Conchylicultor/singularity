import { MdFormatListNumbered, MdKeyboardArrowDown } from "react-icons/md";
import {
  FloatingAction,
  FloatingActionFadeIn,
} from "@plugins/primitives/plugins/floating-action/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
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

  if (result.pending) return null;

  const entries = extractUserEntries(result.data);
  if (entries.length === 0) return null;

  const scrollTo = (eventIndex: number, from: Element) => {
    const scroll = paneScrollFrom(from);
    const el = scroll?.querySelector(`[data-event-index="${eventIndex}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <FloatingAction
      // eslint-disable-next-line layout/no-adhoc-layout -- FloatingAction's API takes the consumer's absolute positioning (here an asymmetric top/right corner inset Pin can't express) in its className
      className="absolute top-2 right-3 z-nav"
      anchor="top-right"
      panelClassName="flex-col w-[3.25rem] group-data-open/fa:w-56 max-h-[1.625rem] group-data-open/fa:max-h-80"
      trigger={
        <Frame
          gap="xs"
          className="px-sm py-xs group-data-open/fa:border-b group-data-open/fa:border-border/40"
          leading={
            <>
              <MdFormatListNumbered className="size-3.5 text-muted-foreground" />
              <Text as="span" variant="caption" className="tabular-nums text-muted-foreground">
                {entries.length}
              </Text>
            </>
          }
          trailing={
            <span className="text-3xs font-medium tracking-wide text-muted-foreground opacity-0 transition-opacity duration-150 group-data-open/fa:opacity-100">
              messages
            </span>
          }
        />
      }
    >
      <Column
        fill
        body={
          <FloatingActionFadeIn>
            {entries.map((entry) => (
              <button
                key={entry.eventIndex}
                type="button"
                onClick={(e) => scrollTo(entry.eventIndex, e.currentTarget)}
                className="w-full px-sm py-xs text-left text-caption hover:bg-accent"
              >
                <Frame
                  gap="sm"
                  align="start"
                  leading={
                    <span className="tabular-nums text-muted-foreground">
                      #{entry.userIndex}
                    </span>
                  }
                  content={truncate(entry.text)}
                  className="text-foreground/80"
                />
              </button>
            ))}
          </FloatingActionFadeIn>
        }
        footer={
          <FloatingActionFadeIn>
            <button
              type="button"
              onClick={(e) => {
                const container = paneScrollFrom(e.currentTarget);
                container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
              }}
              className="w-full border-t border-border/40 py-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Center>
                <MdKeyboardArrowDown className="size-4" />
              </Center>
            </button>
          </FloatingActionFadeIn>
        }
      />
    </FloatingAction>
  );
}
