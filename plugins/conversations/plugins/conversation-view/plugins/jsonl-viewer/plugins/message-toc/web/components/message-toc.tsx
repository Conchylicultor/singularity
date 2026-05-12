import { useMemo } from "react";
import { MdFormatListNumbered, MdKeyboardArrowDown } from "react-icons/md";
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

export function MessageToc() {
  const { conversation } = conversationPane.useData();
  const { data } = useResource(jsonlEventsResource, { id: conversation.id });
  const entries = useMemo(() => extractUserEntries(data), [data]);

  if (entries.length === 0) return null;

  const scrollTo = (eventIndex: number) => {
    const el = document.querySelector(`[data-event-index="${eventIndex}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="group/toc absolute top-2 right-3 z-10">
      <div
        className={
          "flex flex-col overflow-hidden rounded-md border border-border/60 shadow-sm backdrop-blur" +
          " bg-background/80 group-hover/toc:bg-background/90 group-hover/toc:shadow-md" +
          " w-[3.25rem] group-hover/toc:w-56" +
          " max-h-[1.625rem] group-hover/toc:max-h-80" +
          " transition-[width,max-height,background-color,box-shadow] duration-200 ease-out"
        }
      >
        {/* Header row — always visible, morphs from pill to panel header */}
        <div className="flex shrink-0 items-center gap-1.5 px-2 py-1 group-hover/toc:border-b group-hover/toc:border-border/40">
          <MdFormatListNumbered className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
            {entries.length}
          </span>
          <span className="ml-auto text-[10px] font-medium uppercase tracking-wide text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/toc:opacity-100">
            messages
          </span>
        </div>

        {/* Entry list — revealed as container expands */}
        <div className="min-h-0 flex-1 overflow-y-auto opacity-0 transition-opacity duration-150 delay-75 group-hover/toc:opacity-100">
          {entries.map((entry) => (
            <button
              key={entry.eventIndex}
              type="button"
              onClick={() => scrollTo(entry.eventIndex)}
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
        </div>

        {/* Scroll-to-bottom — pinned footer */}
        <button
          type="button"
          onClick={() => {
            const container = document.querySelector("[data-event-index]")
              ?.closest(".overflow-auto");
            container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
          }}
          className="flex shrink-0 w-full items-center justify-center border-t border-border/40 py-1 text-muted-foreground opacity-0 transition-opacity duration-150 delay-75 hover:bg-accent hover:text-foreground group-hover/toc:opacity-100"
        >
          <MdKeyboardArrowDown className="size-4" />
        </button>
      </div>
    </div>
  );
}
