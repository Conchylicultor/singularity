import { useEffect, useRef, useState } from "react";
import { MdClose, MdCode } from "react-icons/md";
import { useResource } from "@core";
import { Button } from "@/components/ui/button";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { jsonlEventsResource } from "../../shared";
import { convJsonlPane } from "../panes";
import { EventRow } from "./event-row";

export function JsonlPane() {
  const { conversation } = conversationPane.useData();
  const { data, error, isLoading } = useResource(jsonlEventsResource, {
    id: conversation.id,
  });
  const events = data ?? null;
  const [markdownMode, setMarkdownMode] = useState(true);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastCountRef = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !events) return;
    const isInitialLoad = lastCountRef.current === 0;
    const pinnedToBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    const grew = events.length > lastCountRef.current;
    lastCountRef.current = events.length;
    if (grew && (isInitialLoad || pinnedToBottom)) {
      el.scrollTop = el.scrollHeight;
    }
  }, [events]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          title="Close JSONL"
          aria-label="Close JSONL"
          onClick={() => convJsonlPane.close()}
        >
          <MdClose className="size-4" />
        </Button>
        <div className="text-sm font-medium">JSONL</div>
        {events !== null && (
          <span className="tabular-nums text-xs text-muted-foreground">
            {events.length}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={`ml-auto size-7 shrink-0 ${markdownMode ? "bg-accent text-accent-foreground" : ""}`}
          title={markdownMode ? "Show raw text" : "Render markdown"}
          aria-label={markdownMode ? "Show raw text" : "Render markdown"}
          aria-pressed={markdownMode}
          onClick={() => setMarkdownMode((m) => !m)}
        >
          <MdCode className="size-4" />
        </Button>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        {events === null && isLoading ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="px-3 py-2 text-xs text-destructive">
            {error instanceof Error ? error.message : String(error)}
          </div>
        ) : !events || events.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No transcript yet. Claude may not have written its session log.
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-2">
            {events.map((event, i) => (
              <EventRow key={i} event={event} markdownMode={markdownMode} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
