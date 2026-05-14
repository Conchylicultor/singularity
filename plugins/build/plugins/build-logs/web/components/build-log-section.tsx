import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { MdContentCopy } from "react-icons/md";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { useReconnectingWebSocket } from "@plugins/primitives/plugins/networking/web";
import { useStickyScroll, JumpToBottomButton } from "@plugins/primitives/plugins/auto-scroll/web";
import type { ClientMessage, ServerMessage, LogEntryWire } from "@plugins/debug/plugins/logs/core";

const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/logs`;

export function BuildLogSection({ runId: _runId }: { runId: string }) {
  const [entries, setEntries] = useState<LogEntryWire[]>([]);
  const lastSeqRef = useRef<number>(0);

  const stickyScroll = useStickyScroll({ resetKey: "build" });

  useReconnectingWebSocket({
    url: WS_URL,
    enabled: true,
    onOpen: (ws) => {
      const msg: ClientMessage = {
        type: "subscribe",
        channel: "build",
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

  const copyLogs = useCallback(() => {
    const text = entries.map((e) => e.line).join("\n");
    navigator.clipboard.writeText(text).then(() => {
      Shell.Toast({ description: "Logs copied to clipboard", variant: "info" });
    });
  }, [entries]);

  return (
    <div className="relative flex flex-col">
      <div className="flex items-center justify-between pb-1">
        <span className="text-xs font-medium text-muted-foreground">Logs</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={copyLogs}
          disabled={entries.length === 0}
          aria-label="Copy logs"
        >
          <MdContentCopy className="size-3" />
        </Button>
      </div>
      <div
        ref={stickyScroll.scrollRef}
        className="min-h-48 max-h-96 overflow-y-auto rounded border bg-muted/30 px-3 py-2 font-mono text-xs leading-5"
      >
        <div ref={stickyScroll.contentRef}>
          {entries.length === 0 && (
            <span className="text-muted-foreground">No build logs yet</span>
          )}
          {entries.map((entry) => (
            <div
              key={entry.seq}
              className={cn(
                "flex gap-2",
                entry.stream === "stderr" ? "text-destructive" : "text-foreground",
              )}
            >
              <span className="shrink-0 text-muted-foreground">
                {new Date(entry.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                })}
              </span>
              <span className="whitespace-pre-wrap break-all">{entry.line}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
        <JumpToBottomButton handle={stickyScroll} />
      </div>
    </div>
  );
}
