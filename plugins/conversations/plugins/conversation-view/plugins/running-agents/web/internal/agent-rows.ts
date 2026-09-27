import {
  AgentInputSchema,
  DEFAULT_AGENT_TYPE,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/agent/core";
import { parseWorkflowMeta } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/workflow/core";
import type {
  LastStep,
  SubagentActivityRow,
  SubagentRunState,
  WorkflowRunEntry,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/subagents/core";
import type { SubagentEntry } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/subagents/web";

/** How long a sub-agent that has stopped stays on screen before it leaves. */
export const DONE_LINGER_MS = 3000;

/** The parent key a workflow run's row goes by, and its agents point at. */
export function workflowRowKey(runId: string): string {
  return `workflow:${runId}`;
}

/** What every row of the band says, whichever kind of thing it is. */
interface RowBase {
  key: string;
  /** The row this one sits under, or `null` at the top level. */
  parentKey: string | null;
  /** The type cell: what kind of agent it is. */
  type: string;
  description: string;
  state: SubagentRunState;
  startedAt: Date;
  /** `null` while it is still running. */
  endedAt: Date | null;
}

/**
 * One sub-agent as the band draws it — a flat row, because that is what a
 * `DataView` field schema projects from.
 *
 * Everything here is READ from the sub-agents plugin; nothing is re-derived.
 * Where the meta file recorded a fact it wins, and where it did not the
 * parent's own `Agent` call is asked instead: the harness only started writing
 * `requestShape` partway through Claude Code's history (missing in 396 of 818
 * real meta files), and `run_in_background` in the call says the same thing for
 * the older half.
 */
export interface AgentBandRow extends RowBase {
  kind: "agent";
  /**
   * The sub-agent's own id — stable for as long as it exists, and the key its
   * report pane opens by. Every sub-agent has one, whoever spawned it, so every
   * agent row opens.
   */
  key: string;
  /**
   * The row it sits under: its workflow run's row when a `Workflow` spawned it,
   * else the sub-agent that spawned it, else `null` when the conversation did —
   * or when the harness did not record it (older Claude Code versions write no
   * `parentAgentId`), which the band renders as top-level.
   */
  parentKey: string | null;
  /**
   * `subagent_type`, or the type a launch without one runs as. A workflow
   * agent's phase instead, when its meta recorded one: its `agentType` is
   * always "workflow-subagent", which says nothing its run row does not.
   */
  type: string;
  /** `null` = the harness recorded no model, not "the default model". */
  model: string | null;
  background: boolean;
  /** `null` = it has written nothing classifiable yet, not "it did nothing". */
  lastStep: LastStep | null;
  /** The row this was read from, for the surfaces that take the whole union. */
  row: SubagentActivityRow;
}

/**
 * One `Workflow` run: the parent row its agents sit under. It has no
 * transcript of its own and no pane — the transcript's Workflow card is where
 * a run is looked at — so it only groups, and folds.
 */
export interface WorkflowBandRow extends RowBase {
  kind: "workflow";
  /** {@link workflowRowKey} of the run. */
  key: string;
  /** Always top-level: the conversation launched the run. */
  parentKey: null;
  /** Always "workflow". */
  type: string;
  /** The script's `meta.name`, else the run id. */
  description: string;
  runId: string;
}

/** One line of the band: a sub-agent, or the workflow run some sit under. */
export type RunningAgentRow = AgentBandRow | WorkflowBandRow;

/** One sub-agent, flattened for the band. */
export function agentRow(entry: SubagentEntry): AgentBandRow {
  const call = entry.agentToolEvent;
  // Parsed, not cast: a transcript whose shape drifted fails here rather than
  // rendering `undefined` as a sub-agent's type.
  const input =
    call === undefined ? undefined : AgentInputSchema.parse(call.input);
  const described = entry.row.kind === "described" ? entry.row : undefined;
  const workflow = entry.row.workflow;
  return {
    kind: "agent",
    key: entry.row.agentId,
    parentKey:
      workflow !== undefined
        ? workflowRowKey(workflow.runId)
        : (described?.parentAgentId ?? null),
    type:
      described?.workflowPhase ??
      described?.agentType ??
      input?.subagent_type ??
      DEFAULT_AGENT_TYPE,
    description: described?.description ?? input?.description ?? "",
    model: described?.model ?? input?.model ?? null,
    background:
      described?.requestShape !== undefined
        ? described.requestShape === "background"
        : input?.run_in_background === true,
    lastStep: entry.lastStep,
    state: entry.state,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    row: entry.row,
  };
}

/** One workflow run, flattened for the band. */
export function workflowRow(run: WorkflowRunEntry): WorkflowBandRow {
  // The call's `script` is `unknown` on the wire; a run launched from a
  // `scriptPath` has none, and then its id is the only name it has.
  const script = run.call?.input;
  const source =
    typeof script === "object" &&
    script !== null &&
    "script" in script &&
    typeof script.script === "string"
      ? script.script
      : undefined;
  return {
    kind: "workflow",
    key: workflowRowKey(run.runId),
    parentKey: null,
    type: "workflow",
    description:
      (source === undefined ? undefined : parseWorkflowMeta(source)?.name) ??
      run.runId,
    state: run.state,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    runId: run.runId,
  };
}

/** What the band is drawn from: the sub-agents plugin's `known` reading. */
export interface BandSource {
  entries: readonly SubagentEntry[];
  workflowRuns: readonly WorkflowRunEntry[];
}

/**
 * Every row the band could draw: the sub-agents in the order they arrive (start
 * order — the sibling order the band's ranks are minted from), with each run's
 * row slotted in ahead of the first sub-agent that started after it.
 *
 * A merge, not a sort: the sub-agents' own order is the subagents plugin's to
 * give, and re-sorting it here would be a second opinion about it.
 */
function bandRows({ entries, workflowRuns }: BandSource): RunningAgentRow[] {
  const runs = workflowRuns.map(workflowRow);
  const rows: RunningAgentRow[] = [];
  let next = 0;
  for (const agent of entries.map(agentRow)) {
    while (next < runs.length && runs[next]!.startedAt <= agent.startedAt) {
      rows.push(runs[next++]!);
    }
    rows.push(agent);
  }
  return rows.concat(runs.slice(next));
}

/** Is this row still on screen at `now`? */
function isShown(row: RunningAgentRow, now: number): boolean {
  return row.endedAt === null || row.endedAt.getTime() + DONE_LINGER_MS > now;
}

/**
 * The conversation's sub-agents worth showing right now: every one still
 * running, plus the ones that stopped within the last {@link DONE_LINGER_MS},
 * plus every ANCESTOR of those.
 *
 * The ancestors are what keep the hierarchy honest. A sub-agent can finish
 * while the ones it spawned keep working; dropping it would leave its children
 * with no parent on screen, and they would silently move up to the top level —
 * a claim that the conversation launched them. So a stopped sub-agent stays,
 * reading "done", for as long as anything under it is still shown.
 *
 * A workflow run's row is such an ancestor for its agents, and is shown in its
 * own right while the run is going — including between phases, with no agent
 * of it live, which is true: the run is still working.
 *
 * The linger is what makes a finish legible. Without it a row simply vanishes
 * at some moment the user was not looking at, and the band silently shrinks;
 * with it, the row says "done m:ss" first.
 *
 * A sub-agent that ended WITHOUT reporting lingers the same way. It stopped —
 * killed, or died with the session — and the honest reading of a stopped
 * sub-agent is that it is no longer working, whichever way it stopped.
 */
export function visibleAgentRows(
  source: BandSource,
  now: number,
): RunningAgentRow[] {
  const rows = bandRows(source);
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const kept = new Set<string>();
  for (const row of rows) {
    if (!isShown(row, now)) continue;
    // Walk up until the chain leaves the rows or meets one already kept. The
    // `kept` check also ends a cycle, which the harness should never write but
    // which must not hang the band if it did.
    for (
      let at: RunningAgentRow | undefined = row;
      at !== undefined && !kept.has(at.key);
      at = at.parentKey === null ? undefined : byKey.get(at.parentKey)
    ) {
      kept.add(at.key);
    }
  }
  return rows.filter((row) => kept.has(row.key));
}

/**
 * When the first of these rows' own linger runs out after `now`, or `null` when
 * none is lingering.
 *
 * The band arms ONE timer to this instant. A timer for a row that is about to
 * leave the screen is presentational — the rows themselves arrive pushed, from
 * the sub-agent activity resource, and nothing here polls for them.
 *
 * Expiries at or before `now` are skipped: such a row is on screen only as the
 * ancestor of a row still shown, and it leaves when that row does — whose own
 * expiry is the one to wait for. Counting them would re-arm a timer that fires
 * at once, forever.
 */
export function nextLingerExpiry(
  rows: readonly RunningAgentRow[],
  now: number,
): number | null {
  const expiries = rows.flatMap((row) => {
    if (row.endedAt === null) return [];
    const expiry = row.endedAt.getTime() + DONE_LINGER_MS;
    return expiry > now ? [expiry] : [];
  });
  return expiries.length === 0 ? null : Math.min(...expiries);
}

/** What the band's summary line says about the rows under it. */
export interface RunningAgentsSummary {
  /** How many are still working. Lingering rows are not counted — they stopped. */
  running: number;
  /**
   * How many workflow runs are still going. Counted apart from `running`: a run
   * between phases has no agent live, yet the band must not read "All agents
   * finished" over a run that is still working.
   */
  runsGoing: number;
  /**
   * When the longest-running one started; `null` when none is running.
   *
   * An instant, not a duration: the clock that turns it into "4:06" ticks
   * inside the one component that shows it (`ElapsedTime`), so the band — and
   * the DataView under it — do not re-render once a second to move two digits.
   */
  longestSince: Date | null;
}

export function summarizeAgents(
  rows: readonly RunningAgentRow[],
): RunningAgentsSummary {
  // Agents only: a workflow run is not an agent working, and counting it would
  // say "4 agents working" over three.
  const running = rows.filter(
    (row) => row.kind === "agent" && row.state.kind === "running",
  );
  return {
    running: running.length,
    runsGoing: rows.filter(
      (row) => row.kind === "workflow" && row.state.kind === "running",
    ).length,
    longestSince: running.reduce<Date | null>(
      (earliest, row) =>
        earliest === null || row.startedAt < earliest
          ? row.startedAt
          : earliest,
      null,
    ),
  };
}
