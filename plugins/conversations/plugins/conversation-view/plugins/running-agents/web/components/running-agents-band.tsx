import { createContext, useContext, useMemo } from "react";
import { MdCheck } from "react-icons/md";
import type { Conversation as ConversationRecord } from "@plugins/tasks/plugins/tasks-core/core";
import {
  DataView,
  defineDataView,
} from "@plugins/primitives/plugins/data-view/web";
import type {
  FieldDef,
  HierarchyConfig,
  HostedToolbar,
  HostedToolbarParts,
} from "@plugins/primitives/plugins/data-view/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  CollapsibleChevron,
  useCollapsible,
  type UseCollapsibleReturn,
} from "@plugins/primitives/plugins/collapsible/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import {
  Fill,
  fillClasses,
} from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { StatusDot } from "@plugins/primitives/plugins/css/plugins/status-dot/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { ElapsedTime } from "@plugins/primitives/plugins/relative-time/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { agentReportPane } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/agent/web";
import { SubagentDuration } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/subagents/web";
import { formatLastStep } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/subagents/core";
import {
  summarizeAgents,
  type RunningAgentRow,
  type RunningAgentsSummary,
} from "../internal/agent-rows";
import { useRunningAgents } from "./use-running-agents";
import "./running-agents-band.css";

const RUNNING_AGENTS_VIEW = defineDataView("running-agents");

const NO_ROWS: RunningAgentRow[] = [];

/**
 * What the card's own header shows — the half of the band that is NOT the
 * DataView's.
 *
 * It travels by context because the frame is a component declared at module
 * scope (a fresh identity each render would remount the whole card), and it
 * renders inside the DataView, below where the band holds this state.
 */
interface BandChrome {
  summary: RunningAgentsSummary;
  collapsible: UseCollapsibleReturn;
}

const BandChromeContext = createContext<BandChrome | null>(null);

function useBandChrome(): BandChrome {
  const chrome = useContext(BandChromeContext);
  if (chrome === null) {
    throw new Error("RunningAgentsCard renders only inside RunningAgentsBand");
  }
  return chrome;
}

/**
 * The marker that says work is still going: one small ring, turning.
 *
 * Held still under `prefers-reduced-motion` rather than removed, so the line
 * keeps the same shape for every reader (see the stylesheet beside this file).
 */
function ActivityRing() {
  return (
    <span
      aria-hidden
      className={cn("running-agents-ring size-3", rigidClass())}
    />
  );
}

/** How long a row has been going, or — once it has stopped — how long it took. */
function ElapsedCell({ row }: { row: RunningAgentRow }) {
  const done = row.endedAt !== null;
  return (
    <Line as="span" className="gap-2xs text-muted-foreground">
      {done && <MdCheck className={cn("size-3", rigidClass())} />}
      {done && <span>done</span>}
      <SubagentDuration
        startedAt={row.startedAt}
        endedAt={row.endedAt}
        className="font-mono tabular-nums"
      />
    </Line>
  );
}

/** What a row says it last did — `formatLastStep`, so a card phrases it the same. */
function lastStepText(row: RunningAgentRow): string {
  return row.lastStep === null
    ? "Nothing written yet"
    : formatLastStep(row.lastStep);
}

/**
 * The row's label: what it was asked to do, then — muted — what it last did.
 *
 * One truncating line, and the order is the priority: when the row runs out of
 * room the last step is cut first and the task stays. It rides in the label
 * rather than in its own field because a tree row's other fields are rigid
 * chips that never shrink — a sentence there squeezes the task to nothing.
 * Plain inline spans only: a box of its own would take the truncation with it.
 */
function TaskLabel({ row }: { row: RunningAgentRow }) {
  return (
    <>
      {row.description}
      <span className="text-muted-foreground">
        {" · "}
        {lastStepText(row)}
      </span>
    </>
  );
}

/**
 * The row schema. One line per sub-agent, nested under the one that spawned
 * it: what it was asked to do and what it last did are the label, what it is
 * (type; model and where it runs a Properties toggle away) sits after it, and
 * its clock at the end.
 */
const FIELDS: FieldDef<RunningAgentRow>[] = [
  {
    id: "description",
    label: "Task",
    type: "text",
    primary: true,
    value: (row) => row.description,
    cell: (row) => <TaskLabel row={row} />,
  },
  { id: "type", label: "Agent", type: "text", value: (row) => row.type },
  { id: "model", label: "Model", type: "text", value: (row) => row.model },
  {
    id: "background",
    label: "Where it runs",
    type: "text",
    value: (row) => (row.background ? "background" : null),
  },
  {
    id: "lastStep",
    label: "Last step",
    type: "text",
    // Shown inside the label (`TaskLabel`); the field stays for search/filter.
    value: lastStepText,
  },
  {
    id: "started",
    label: "Started",
    type: "date",
    align: "end",
    value: (row) => row.startedAt,
    cell: (row) => <ElapsedCell row={row} />,
  },
];

/**
 * The band's card: a summary line that folds the list, and the list itself.
 *
 * This is the DataView's `frame`, so the options trigger it is handed (search,
 * filter, sort, fields — hover-revealed off the card) lands in the header where
 * a user looks for a list's controls, and the rows come back as `body`. Every
 * state renders through it, so the card does not reflow as the view's config
 * settles.
 */
function RunningAgentsCard({ options, switcher, body }: HostedToolbarParts) {
  const { summary, collapsible } = useBandChrome();
  const { open, triggerProps, contentId } = collapsible;
  const working = summary.running > 0;
  return (
    <Text as="div" variant="caption">
      <Clip className="rounded-md border border-border bg-muted/30">
        <Line className="gap-sm px-md py-sm">
          <Line
            as="button"
            {...triggerProps}
            aria-label="Running agents"
            className={cn(
              fillClasses("x"),
              "gap-sm text-left hover:bg-foreground/[0.03]",
            )}
          >
            {working ? (
              <ActivityRing />
            ) : (
              <MdCheck
                className={cn("size-3 text-muted-foreground", rigidClass())}
              />
            )}
            <Fill as="span">
              {working ? (
                <>
                  <span className="font-medium">{summary.running}</span>
                  {summary.running === 1 ? " agent working" : " agents working"}
                  {summary.longestSince !== null && (
                    <span className="text-muted-foreground">
                      {" · longest "}
                      <ElapsedTime
                        since={summary.longestSince}
                        className="font-mono tabular-nums"
                      />
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">
                  All agents finished
                </span>
              )}
            </Fill>
            <CollapsibleChevron
              open={open}
              className={cn("size-4 text-muted-foreground", rigidClass())}
            />
          </Line>
          {switcher}
          {options}
        </Line>
        {open && (
          <div
            id={contentId}
            className="rail-x-2xs border-t border-border/60 bg-background/40 py-2xs"
          >
            {body}
          </div>
        )}
      </Clip>
    </Text>
  );
}

const BAND_TOOLBAR: HostedToolbar = {
  kind: "hosted",
  frame: RunningAgentsCard,
};

/**
 * The sub-agents working for this conversation, above the prompt box.
 *
 * Its own box, stacking with the op-status banner and the turn summary — not
 * fused into the composer's border, which belongs to what the user is typing.
 *
 * There is deliberately **no stop button**. The app drives Claude Code by
 * typing into its terminal, and the only stop that has is Escape, which
 * interrupts the whole turn; a single sub-agent cannot be stopped from here, so
 * a control on one row would be a lie about what pressing it does.
 *
 * Nothing renders until the reads have landed, and nothing renders when no
 * sub-agent is working: an empty band would be a claim, and chrome around
 * nothing is worse than no band.
 */
export function RunningAgentsBand({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const state = useRunningAgents(conversation.id);
  const openPane = useOpenPane();
  const collapsible = useCollapsible({ defaultOpen: true });

  const rows = state.kind === "known" ? state.rows : NO_ROWS;
  const chrome = useMemo<BandChrome>(
    () => ({ summary: summarizeAgents(rows), collapsible }),
    [rows, collapsible],
  );
  // Each sub-agent sits under the one that spawned it. Siblings keep launch
  // order: the rows arrive in start order, and their ranks are minted from that
  // order, so nothing here can reorder them — and there is no `onMove`, so
  // nobody can drag them either.
  const hierarchy = useMemo<HierarchyConfig<RunningAgentRow>>(() => {
    const ranks = new Map(
      Rank.nBetween(null, null, rows.length).map((rank, i) => [
        rows[i]!.key,
        rank,
      ]),
    );
    return {
      getParentId: (row) => row.parentKey,
      getRank: (row) => ranks.get(row.key)!,
    };
  }, [rows]);

  if (state.kind === "pending" || rows.length === 0) return null;

  return (
    <BandChromeContext.Provider value={chrome}>
      <DataView<RunningAgentRow>
        rows={rows}
        fields={FIELDS}
        rowKey={(row) => row.key}
        views={["tree"]}
        hierarchy={hierarchy}
        density="compact"
        storageKey={RUNNING_AGENTS_VIEW}
        searchPlaceholder="Search agents"
        toolbar={BAND_TOOLBAR}
        searchAccessor={(row) => `${row.description} ${row.type}`}
        // A row opens the same report pane its transcript card does, by the
        // sub-agent's own id — the one key every sub-agent has, including a
        // teammate another sub-agent spawned, whose launching call is nowhere
        // in this conversation's transcript.
        rowActivation={(row) => () =>
          openPane(
            agentReportPane,
            { by: "agent", key: row.key },
            { mode: "push" },
          )
        }
        emptyState={
          <Text tone="muted">No agent matches what you searched for.</Text>
        }
        viewOptions={{
          tree: {
            // The band exists to show the whole set; a user fold still wins.
            defaultExpanded: true,
            leadingIcon: (row: RunningAgentRow) => (
              <StatusDot
                colorClass={
                  row.state.kind === "running"
                    ? "bg-muted-foreground"
                    : "bg-muted-foreground/40"
                }
              />
            ),
          },
        }}
      />
    </BandChromeContext.Provider>
  );
}
