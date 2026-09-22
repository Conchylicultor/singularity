import {
  AgentInputSchema,
  DEFAULT_AGENT_TYPE,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/plugins/agent/core";
import type {
  LastStep,
  SubagentActivityRow,
  SubagentRunState,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/subagents/core";
import type { SubagentEntry } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/subagents/web";

/** How long a sub-agent that has stopped stays on screen before it leaves. */
export const DONE_LINGER_MS = 3000;

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
export interface RunningAgentRow {
  /** The sub-agent's own id — stable for as long as it exists. */
  key: string;
  /** `subagent_type`, or the type a launch without one runs as. */
  type: string;
  description: string;
  /** `null` = the harness recorded no model, not "the default model". */
  model: string | null;
  background: boolean;
  /** `null` = it has written nothing classifiable yet, not "it did nothing". */
  lastStep: LastStep | null;
  state: SubagentRunState;
  startedAt: Date;
  /** `null` while it is still running. */
  endedAt: Date | null;
  /**
   * The id its report pane opens by — its own, else the id of the call that
   * named it. `null` = nothing on screen can reach it (an in-process teammate
   * whose call has scrolled out of the chain, or an unreadable meta), which the
   * band renders as a row that does not activate rather than a dead button.
   */
  toolUseId: string | null;
  /** The row this was read from, for the surfaces that take the whole union. */
  row: SubagentActivityRow;
}

/** One sub-agent, flattened for the band. */
export function agentRow(entry: SubagentEntry): RunningAgentRow {
  const call = entry.agentToolEvent;
  // Parsed, not cast: a transcript whose shape drifted fails here rather than
  // rendering `undefined` as a sub-agent's type.
  const input =
    call === undefined ? undefined : AgentInputSchema.parse(call.input);
  const described = entry.row.kind === "described" ? entry.row : undefined;
  return {
    key: entry.row.agentId,
    type: described?.agentType ?? input?.subagent_type ?? DEFAULT_AGENT_TYPE,
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
    toolUseId: described?.toolUseId ?? call?.toolUseId ?? null,
    row: entry.row,
  };
}

/** Is this row still on screen at `now`? */
function isShown(row: RunningAgentRow, now: number): boolean {
  return row.endedAt === null || row.endedAt.getTime() + DONE_LINGER_MS > now;
}

/**
 * The conversation's sub-agents worth showing right now: every one still
 * running, plus the ones that stopped within the last {@link DONE_LINGER_MS}.
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
  entries: readonly SubagentEntry[],
  now: number,
): RunningAgentRow[] {
  return entries.map(agentRow).filter((row) => isShown(row, now));
}

/**
 * When the first of these rows leaves, or `null` when none is lingering.
 *
 * The band arms ONE timer to this instant. A timer for a row that is about to
 * leave the screen is presentational — the rows themselves arrive pushed, from
 * the sub-agent activity resource, and nothing here polls for them.
 */
export function nextLingerExpiry(
  rows: readonly RunningAgentRow[],
): number | null {
  const expiries = rows.flatMap((row) =>
    row.endedAt === null ? [] : [row.endedAt.getTime() + DONE_LINGER_MS],
  );
  return expiries.length === 0 ? null : Math.min(...expiries);
}

/** What the band's summary line says about the rows under it. */
export interface RunningAgentsSummary {
  /** How many are still working. Lingering rows are not counted — they stopped. */
  running: number;
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
  const running = rows.filter((row) => row.state.kind === "running");
  return {
    running: running.length,
    longestSince: running.reduce<Date | null>(
      (earliest, row) =>
        earliest === null || row.startedAt < earliest
          ? row.startedAt
          : earliest,
      null,
    ),
  };
}
