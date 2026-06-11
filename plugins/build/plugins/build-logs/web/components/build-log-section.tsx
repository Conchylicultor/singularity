import { Button, cn } from "@plugins/primitives/plugins/ui-kit/web";
import { useState, useRef, useCallback, useEffect, type ReactElement } from "react";
import { MdContentCopy, MdCheck, MdClose } from "react-icons/md";
import { toast } from "@plugins/notifications/web";
import { useReconnectingWebSocket } from "@plugins/primitives/plugins/networking/web";
import { useStickyScroll, JumpToBottomButton } from "@plugins/primitives/plugins/auto-scroll/web";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  CollapsibleChevron,
} from "@plugins/primitives/plugins/collapsible/web";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { getBuildRunLogs } from "../../shared/endpoints";
import type { BuildStepLog } from "../../shared/endpoints";
import type { ClientMessage, ServerMessage, LogEntryWire } from "@plugins/primitives/plugins/log-channels/core";

// Mono build-log body: intentional fixed code size + line-height (not on the typography scale).
const monoLogClass = "font-mono text-xs leading-5";

export function BuildLogSection({ runId }: { runId: string }): ReactElement {
  const { data } = useEndpoint(getBuildRunLogs, { id: runId });

  const hasPersistedLogs = data && data.steps.length > 0;

  if (hasPersistedLogs) {
    return <PersistedLogs steps={data.steps} />;
  }

  return <LiveLogs />;
}

function PersistedLogs({ steps }: { steps: BuildStepLog[] }): ReactElement {
  const copyAll = useCallback(async () => {
    const text = steps
      .map((s) => {
        const header = `── ${s.label} ${s.success ? "✓" : "✗"} (${(s.durationMs / 1000).toFixed(1)}s)`;
        const body = s.lines.map((l) => `  ${l.text}`).join("\n");
        return body ? `${header}\n${body}` : header;
      })
      .join("\n\n");
    await navigator.clipboard.writeText(text);
    toast({ type: "build", title: "Logs copied", description: "Build logs copied to clipboard", variant: "info" });
  }, [steps]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between pb-1">
        <Text as="span" variant="label" className="text-muted-foreground">Logs</Text>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={copyAll}
          aria-label="Copy logs"
        >
          <MdContentCopy />
        </Button>
      </div>
      {steps.map((step) => (
        <StepSection key={step.id} step={step} />
      ))}
    </div>
  );
}

function StepSection({ step }: { step: BuildStepLog }): ReactElement {
  const duration = (step.durationMs / 1000).toFixed(1);

  return (
    <Collapsible defaultOpen={!step.success || step.lines.length <= 6}>
      <div className="rounded-md border bg-muted/30 overflow-hidden">
        <CollapsibleTrigger className="flex items-center gap-2 px-3 py-1.5 text-caption hover:bg-muted/50 transition-colors">
          <CollapsibleChevron className="size-3 text-muted-foreground" />
          {step.success ? (
            <MdCheck className="size-3.5 text-success shrink-0" />
          ) : (
            <MdClose className="size-3.5 text-destructive shrink-0" />
          )}
          <span className="font-medium">{step.label}</span>
          <span className="text-muted-foreground ml-auto">{duration}s</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {step.lines.length > 0 && (
            <div className={`border-t px-3 py-2 max-h-64 overflow-y-auto ${monoLogClass}`}>
              {step.lines.map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    "whitespace-pre-wrap break-all",
                    line.stream === "stderr" ? "text-destructive" : "text-foreground",
                  )}
                >
                  {line.text}
                </div>
              ))}
            </div>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

const WS_URL = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws/logs`;

function LiveLogs(): ReactElement {
  const [entries, setEntries] = useState<LogEntryWire[]>([]);
  const lastSeqRef = useRef<number>(0);

  const stickyScroll = useStickyScroll({ resetKey: "build" });
  const { scrollIfPinned } = stickyScroll;

  useEffect(() => {
    scrollIfPinned();
  }, [entries.length, scrollIfPinned]);

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
        case "error":
          toast({ type: "build", title: "Build log error", description: msg.error, variant: "error" });
          break;
      }
    },
  });

  const copyLogs = useCallback(async () => {
    const text = entries.map((e) => e.line).join("\n");
    await navigator.clipboard.writeText(text);
    toast({ type: "build", title: "Logs copied", description: "Build logs copied to clipboard", variant: "info" });
  }, [entries]);

  return (
    <div className="relative flex flex-col">
      <div className="flex items-center justify-between pb-1">
        <Text as="span" variant="label" className="text-muted-foreground">
          Logs <span className="text-muted-foreground/60 ml-1">Live</span>
        </Text>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={copyLogs}
          disabled={entries.length === 0}
          aria-label="Copy logs"
        >
          <MdContentCopy />
        </Button>
      </div>
      <div
        ref={stickyScroll.scrollRef}
        className={`min-h-48 max-h-96 overflow-y-auto rounded-md border bg-muted/30 px-3 py-2 ${monoLogClass}`}
      >
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
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
        <JumpToBottomButton handle={stickyScroll} />
      </div>
    </div>
  );
}
