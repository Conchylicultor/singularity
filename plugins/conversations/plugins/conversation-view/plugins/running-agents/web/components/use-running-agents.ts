import { useEffect, useMemo, useState } from "react";
import { useConversationSubagents } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/subagents/web";
import type { SubagentEntry } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/subagents/web";
import {
  nextLingerExpiry,
  visibleAgentRows,
  type RunningAgentRow,
} from "../internal/agent-rows";

/**
 * What the band knows about this conversation's sub-agents right now.
 *
 * `pending` is a real arm: "how many agents are working" is answered from the
 * sub-agent files AND the parent transcript, so until both have arrived there
 * is no honest answer — and an empty band is a claim ("none are working") that
 * would then reverse itself the moment the reads land.
 */
export type RunningAgentsState =
  { kind: "pending" } | { kind: "known"; rows: RunningAgentRow[] };

const NO_ENTRIES: SubagentEntry[] = [];

/**
 * The sub-agents to show above the prompt box: every one still running, plus
 * the ones that stopped moments ago and are still saying so.
 *
 * Run state is NOT derived here. It comes from the subagents plugin, which owns
 * the three-armed answer (running / finished / ended without reporting) and
 * reads it from what each sub-agent and its parent actually wrote.
 *
 * The linger needs one thing the pushed data cannot provide: a re-render at the
 * moment a row's three seconds are up. That is one `setTimeout` to the next
 * expiry — a presentational timer, not a poll. An expiry already behind the
 * real clock (the rows changed under a stale reading of it) fires at once.
 */
export function useRunningAgents(conversationId: string): RunningAgentsState {
  const subagents = useConversationSubagents(conversationId);
  const entries = subagents.kind === "known" ? subagents.entries : NO_ENTRIES;

  // The instant the linger is measured against.
  const [now, setNow] = useState(() => Date.now());
  const rows = useMemo(() => visibleAgentRows(entries, now), [entries, now]);

  useEffect(() => {
    const expiry = nextLingerExpiry(rows);
    if (expiry === null) return;
    const id = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, expiry - Date.now()),
    );
    return () => clearTimeout(id);
  }, [rows]);

  if (subagents.kind === "pending") return { kind: "pending" };
  return { kind: "known", rows };
}
