import { useCallback, useEffect, useState } from "react";
import { MdClose, MdCode, MdRefresh } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import type { JsonlEvent, JsonlEventsResponse } from "../../shared";
import { convJsonlPane } from "../panes";
import { EventRow } from "./event-row";

export function JsonlPane() {
  const { conversation } = conversationPane.useData();
  const [events, setEvents] = useState<JsonlEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [markdownMode, setMarkdownMode] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/jsonl`);
      if (!res.ok) {
        setError(`${res.status} ${res.statusText}`);
        setEvents([]);
        return;
      }
      const body = (await res.json()) as JsonlEventsResponse;
      setEvents(body.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [conversation.id]);

  useEffect(() => {
    setEvents(null);
    void load();
  }, [load]);

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
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          title="Reload"
          aria-label="Reload"
          disabled={loading}
          onClick={() => void load()}
        >
          <MdRefresh className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {events === null ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="px-3 py-2 text-xs text-destructive">{error}</div>
        ) : events.length === 0 ? (
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
