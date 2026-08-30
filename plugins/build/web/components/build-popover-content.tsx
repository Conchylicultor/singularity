import {
  Button,
  cn,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  fetchEndpoint,
  EndpointError,
} from "@plugins/infra/plugins/endpoints/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { triggerBuildEndpoint } from "../../core/endpoints";
import { MdContentCopy, MdPlayArrow } from "react-icons/md";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  useReconnectingWebSocket,
  wsUrl,
} from "@plugins/primitives/plugins/networking/web";
import {
  useStickyScroll,
  JumpToBottomButton,
} from "@plugins/primitives/plugins/auto-scroll/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { RunsDataView } from "@plugins/runs/web";
// The one declaration of the kind a build run carries — not a literal repeated
// here, which would have gone on silently highlighting nothing after a rename.
// It lives in `run-ledger` (a leaf) rather than in the arm because importing it
// from the arm closed a real plugin-level cycle: `build.web → build/runs-arm`
// against the arm's own `→ build/web`. The boundary checker collapses runtimes
// for cycle detection, which is what made the "different zone.runtime nodes"
// reasoning wrong.
import { BUILD_RUN_KIND } from "@plugins/build/plugins/run-ledger/core";
import { DeploymentChain } from "@plugins/build/plugins/deployment/web";
import { buildHistoryResource } from "../../shared";
import type { BuildRun } from "../../shared";
import type {
  ClientMessage,
  ServerMessage,
  LogEntryWire,
} from "@plugins/primitives/plugins/log-channels/core";
import { textVariantClass } from "@plugins/primitives/plugins/css/plugins/text/web";

const LOGS_WS_PATH = "/ws/logs";

// Both build surfaces open on the `active` tab, which is empty whenever nothing
// is in flight — the normal case. The shared surface's own default reads
// "Nothing has run here yet.", which on that tab is a false claim about a
// machine with thousands of recorded runs. Say what is actually true of an empty
// FILTERED list instead. (The real fix belongs in `runs`, whose empty state
// should know whether a filter is narrowing it; until then this is the honest
// wording here.)
const NO_MATCHING_RUNS = <>Nothing matches this view.</>;

// Mono build-log viewer: intentional fixed code size + line-height (not on the typography scale).
// Overflow is owned by the `<Scroll axis="y">` wrapper, not baked in here.
const logViewerClass = cn("bg-muted/30 px-md py-sm", textVariantClass("code"));

function BuildControls({
  building,
  onBuild,
}: {
  building: boolean;
  onBuild: () => void | Promise<void>;
}) {
  return (
    <Stack
      direction="row"
      align="center"
      gap="sm"
      className="border-b px-md py-sm"
    >
      <Button variant="default" loading={building} onClick={() => onBuild()}>
        <MdPlayArrow className="size-4" />
        Build
      </Button>
    </Stack>
  );
}

function BuildLogView({ variant }: { variant: "popover" | "pane" }) {
  const [entries, setEntries] = useState<LogEntryWire[]>([]);
  const lastSeqRef = useRef<number>(0);
  const selectedRef = useRef("build");

  const { scrollRef, bottomSentinel, isFollowing, jumpToBottom } =
    useStickyScroll();

  const wsHandle = useReconnectingWebSocket({
    url: wsUrl(LOGS_WS_PATH),
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
          toast({
            type: "build",
            title: "Build log error",
            description: msg.error,
            variant: "error",
          });
          break;
      }
    },
  });

  // Re-subscribe on reconnect
  useEffect(() => {
    const handle = wsHandle.current;
    if (!handle) return;
    const msg: ClientMessage = {
      type: "subscribe",
      channel: selectedRef.current,
    };
    handle.send(JSON.stringify(msg));
  }, [wsHandle]);

  const copyLogs = useCallback(async () => {
    const text = entries.map((e) => e.line).join("\n");
    await navigator.clipboard.writeText(text);
    toast({
      type: "build",
      title: "Logs copied",
      description: "Build logs copied to clipboard",
      variant: "info",
    });
  }, [entries]);

  return (
    <Stack gap="none" className="relative border-b">
      <Stack
        direction="row"
        align="center"
        justify="between"
        gap="none"
        className="border-b px-md py-xs"
      >
        <Text as="span" variant="label" className="text-muted-foreground">
          Logs
        </Text>
        <ControlSizeProvider size="xs">
          <IconButton
            icon={MdContentCopy}
            label="Copy logs"
            variant="ghost"
            onClick={copyLogs}
            disabled={entries.length === 0}
          />
        </ControlSizeProvider>
      </Stack>
      <Scroll
        axis="y"
        fill={variant === "pane"}
        ref={scrollRef}
        className={cn(
          logViewerClass,
          variant === "popover" ? "h-48" : "min-h-48",
        )}
      >
        {entries.length === 0 && (
          <span className="text-muted-foreground">No build logs yet</span>
        )}
        {entries.map((entry) => (
          <Stack
            direction="row"
            gap="sm"
            key={entry.seq}
            className={
              entry.stream === "stderr" ? "text-destructive" : "text-foreground"
            }
          >
            <span className={cn(rigidClass(), "text-muted-foreground")}>
              {new Date(entry.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              })}
            </span>
            <span className="whitespace-pre-wrap break-all">{entry.line}</span>
          </Stack>
        ))}
        {/* Must stay the last child: it marks the true end of the content. */}
        {bottomSentinel}
      </Scroll>
      {/* Off-ramp bottom-1 (0.25rem) offset, not on the spacing ramp. */}
      <Pin to="bottom" style={{ bottom: "0.25rem" }}>
        <JumpToBottomButton handle={{ isFollowing, jumpToBottom }} />
      </Pin>
    </Stack>
  );
}

/**
 * Inner: receives settled history so hooks always run with real data.
 *
 * `buildRuns` is here for ONE thing — whether a build of this checkout is in
 * flight, which is what the Build control's spinner says. It is deliberately not
 * the list: the list below is the merged runs surface, which pages every
 * ledger's rows off its own keyset query. The two must not be confused, hence
 * the name.
 */
function BuildPopoverContentInner({
  variant,
  buildRuns,
  selectedRunId,
  onRowActivate,
}: {
  variant: "popover" | "pane";
  buildRuns: BuildRun[];
  selectedRunId?: string;
  onRowActivate?: () => void;
}) {
  const latestRun = buildRuns[0];
  const building = latestRun?.finishedAt === null;

  const handleBuild = useCallback(async () => {
    try {
      await fetchEndpoint(triggerBuildEndpoint, {});
      toast({
        type: "build",
        title: "Build started",
        description: "Running ./singularity build",
        variant: "info",
      });
    } catch (err) {
      if (err instanceof EndpointError) {
        toast({
          type: "build",
          title: "Build failed to start",
          description: err.message,
          variant: "error",
        });
      } else {
        toast({
          type: "build",
          title: "Build failed to start",
          description: "Server unreachable",
          variant: "error",
        });
      }
    }
  }, []);

  return (
    <Stack gap="none" className={cn(variant === "pane" && "h-full")}>
      {/* What is actually deployed, above the control that changes it: the
          commit chain with a chip per carrier on the commit it is really on.
          Its verdict is the SAME `convergenceOf` answer the auto-build
          reconciler acts on, so a wrong badge here and a missed rebuild are
          one bug rather than two. */}
      <DeploymentChain />
      <BuildControls building={building} onBuild={handleBuild} />
      {variant === "popover" ? (
        <>
          <BuildLogView variant={variant} />
          {/* The popover has to supply the history scroll itself. A DataView is
              always natural-height and never opens a scroller, and here there is
              no `PaneChrome` above it to do so — the whole loaded window would
              otherwise push the panel to full viewport height. Capped just above
              the log view's `h-48` so the two read as a pair rather than as a log
              with a wall of history under it. */}
          <Scroll axis="y" className="max-h-64">
            <RunsDataView
              density="compact"
              defaultView="active"
              emptyState={NO_MATCHING_RUNS}
              onRowActivate={onRowActivate}
            />
          </Scroll>
        </>
      ) : (
        <RunsDataView
          emptyState={NO_MATCHING_RUNS}
          // The pair, not the bare id: a run id is only unique inside its own
          // ledger, and the row this pane has open is by construction a build.
          selectedRun={
            selectedRunId === undefined
              ? undefined
              : { kind: BUILD_RUN_KIND, id: selectedRunId }
          }
        />
      )}
    </Stack>
  );
}

export function BuildPopoverContent({
  variant,
  selectedRunId,
  onRowActivate,
}: {
  variant: "popover" | "pane";
  /** The build run whose detail pane is open, highlighted in the list. */
  selectedRunId?: string;
  /**
   * The host's own business after a row click — the toolbar popover closing
   * itself. NOT where the row goes: that is the arm's, and runs first.
   */
  onRowActivate?: () => void;
}) {
  const historyResult = useResource(buildHistoryResource);
  if (historyResult.pending) {
    return (
      <Stack gap="none" className={cn(variant === "pane" && "h-full")}>
        <Loading variant="rows" count={3} />
      </Stack>
    );
  }
  return (
    <BuildPopoverContentInner
      variant={variant}
      buildRuns={historyResult.data}
      selectedRunId={selectedRunId}
      onRowActivate={onRowActivate}
    />
  );
}
