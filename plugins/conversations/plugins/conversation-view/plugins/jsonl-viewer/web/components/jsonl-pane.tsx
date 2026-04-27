import { useEffect, useRef, useState } from "react";
import { MdCode } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Button } from "@/components/ui/button";
import type { Conversation } from "@plugins/conversations/shared";
import { jsonlEventsResource } from "../../shared";
import { EventRow } from "./event-row";

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function WorkingIndicator({ startAt }: { startAt: number }) {
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - startAt) / 1000),
  );
  useEffect(() => {
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - startAt) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [startAt]);

  return (
    <div className="flex items-center gap-2 px-1 py-1">
      <div className="flex items-center gap-1">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="size-1.5 animate-bounce rounded-full bg-muted-foreground/40"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
      <span className="tabular-nums text-xs text-muted-foreground/60">
        Working for {formatElapsed(elapsed)}
      </span>
    </div>
  );
}

export function JsonlPane({ conversation }: { conversation: Conversation }) {
  const isWorking = conversation.status === "working" || conversation.status === "starting";
  const { data, error, isLoading } = useResource(jsonlEventsResource, {
    id: conversation.id,
  });
  const events = data ?? null;
  const [markdownMode, setMarkdownMode] = useState(true);

  // Derive when "working" started: last event's timestamp, or now if none
  const workingStartAtRef = useRef<number | null>(null);
  const wasWorkingRef = useRef(false);
  if (isWorking) {
    if (!wasWorkingRef.current) {
      // Transition into working: seed from last event or now
      const lastEvent = events?.length ? events[events.length - 1] : null;
      const lastAt = lastEvent?.at ?? null;
      workingStartAtRef.current = lastAt ? new Date(lastAt).getTime() : Date.now();
    }
    wasWorkingRef.current = true;
  } else {
    wasWorkingRef.current = false;
    workingStartAtRef.current = null;
  }
  const workingStartAt = workingStartAtRef.current ?? Date.now();

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
          <div className="flex flex-col px-3 py-2 text-xs text-muted-foreground">
            <span>No transcript yet. Claude may not have written its session log.</span>
            {isWorking && <WorkingIndicator startAt={workingStartAt} />}
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-2">
            {events.map((event, i) => (
              <EventRow key={i} event={event} markdownMode={markdownMode} />
            ))}
            {isWorking && <WorkingIndicator startAt={workingStartAt} />}
          </div>
        )}
      </div>
    </div>
  );
}
