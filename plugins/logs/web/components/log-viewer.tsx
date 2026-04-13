import { useEffect, useRef, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchWithRetry, useReconnectingWebSocket } from "@core";
import type { ClientMessage, ServerMessage, LogEntryWire } from "../../shared/protocol";

const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/logs`;

export function LogViewer({ initialChannel }: { initialChannel?: string }) {
  const [channels, setChannels] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(initialChannel ?? null);
  const [entries, setEntries] = useState<LogEntryWire[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const lastSeqRef = useRef<number>(0);
  const selectedRef = useRef<string | null>(selected);
  selectedRef.current = selected;

  useEffect(() => {
    fetchWithRetry("/api/logs/channels")
      .then((r) => r.json())
      .then((data: { channels: string[] }) => {
        setChannels(data.channels);
        if (!initialChannel && data.channels.length > 0 && data.channels[0]) {
          setSelected(data.channels[0]);
        }
      });
  }, [initialChannel]);

  useEffect(() => {
    const sentinel = bottomRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]) nearBottomRef.current = entries[0].isIntersecting;
      },
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (nearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    }
  }, [entries]);

  // Reset on channel change
  useEffect(() => {
    lastSeqRef.current = 0;
    setEntries([]);
  }, [selected]);

  const wsHandle = useReconnectingWebSocket({
    url: WS_URL,
    enabled: selected !== null,
    onOpen: (ws) => {
      const channel = selectedRef.current;
      if (!channel) return;
      const msg: ClientMessage = {
        type: "subscribe",
        channel,
        ...(lastSeqRef.current > 0 && { fromSequence: lastSeqRef.current }),
      };
      ws.send(JSON.stringify(msg));
    },
    onMessage: (event) => {
      const msg: ServerMessage = JSON.parse(event.data);
      switch (msg.type) {
        case "history":
          if (msg.entries.length === 0) break;
          setEntries((prev) => [...prev, ...msg.entries]);
          lastSeqRef.current = Math.max(
            lastSeqRef.current,
            msg.entries[msg.entries.length - 1]!.seq,
          );
          break;
        case "entry":
          if (msg.seq <= lastSeqRef.current) break;
          lastSeqRef.current = msg.seq;
          setEntries((prev) => [...prev, msg]);
          break;
      }
    },
  });

  // Re-subscribe when channel changes on an already-open socket
  useEffect(() => {
    if (!selected) return;
    const handle = wsHandle.current;
    if (!handle) return;
    const msg: ClientMessage = { type: "subscribe", channel: selected };
    handle.send(JSON.stringify(msg));
  }, [selected, wsHandle]);

  return (
    <div className="flex h-full flex-col p-6 space-y-4">
      <Select value={selected ?? undefined} onValueChange={(val: string | null) => setSelected(val)}>
        <SelectTrigger>
          <SelectValue placeholder="Select channel" />
        </SelectTrigger>
        <SelectContent>
          {channels.map((ch) => (
            <SelectItem key={ch} value={ch}>
              {ch}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ScrollArea className="flex-1 rounded-md border bg-muted/30">
        <div className="p-4 font-mono text-xs leading-5">
          {entries.map((entry) => (
            <div
              key={entry.seq}
              className={
                entry.stream === "stderr"
                  ? "text-destructive"
                  : "text-foreground"
              }
            >
              {entry.line}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
