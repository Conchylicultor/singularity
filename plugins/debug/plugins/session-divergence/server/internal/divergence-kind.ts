import { ReportKind } from "@plugins/reports/server";
import type { ReportRow } from "@plugins/reports/server";
import {
  SessionDivergencePayloadSchema,
  type SessionDivergencePayload,
} from "../../core";

// Re-alert the bell at most once per ~6h while a conversation stays diverged.
// A standing divergence is a live data-loss condition (turns are being written
// where the UI cannot read them), so it should resurface periodically without
// spamming — matching the read-set-shrink / live-state-noop 6h re-arm.
const DIVERGENCE_NOTIF_COOLDOWN_MS = 6 * 60 * 60 * 1000;

// The `conversation-session-divergence` report kind. Dedups per conversation
// (fingerprint `session-divergence:<conversationId>`), so a conversation stuck
// in divergence collapses to a single task whose `count` is how many 5-minute
// ticks saw it still standing. Variant `warning`: nothing is crashing — the
// agent runs fine — but every turn it takes is invisible to the user.
export const sessionDivergenceKind = ReportKind({
  kind: "conversation-session-divergence",
  schema: SessionDivergencePayloadSchema,
  fingerprint: (d: SessionDivergencePayload) =>
    `session-divergence:${d.conversationId}`,
  meta: {
    tag: "[session]",
    notif: "Conversation talking in an unrecorded session",
    variant: "warning",
    notifCooldownMs: DIVERGENCE_NOTIF_COOLDOWN_MS,
  },
  renderTask: (row: ReportRow) => {
    const d = SessionDivergencePayloadSchema.parse(row.data);
    return {
      title: `[session] Session divergence: ${d.conversationId}`,
      description: renderDescription(row, d),
    };
  },
});

function formatLead(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 120) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

function renderDescription(
  row: ReportRow,
  d: SessionDivergencePayload,
): string {
  const leadMs = d.liveMtimeMs - d.tailMtimeMs;
  const lines: string[] = [];
  lines.push(
    `Conversation \`${d.conversationId}\` has a live Claude session ` +
      `\`${d.liveSubtreeSessionId}\` running inside its tmux pane's process ` +
      `subtree, but that session id is **absent from its recorded session ` +
      `chain** (\`conversation_sessions\`). Its transcript is being written ` +
      `**${formatLead(leadMs)} ahead** of the chain tail's ` +
      `(\`${d.chainTailSessionId}\`).`,
  );
  lines.push("");
  lines.push(
    `That means the agent is talking somewhere the UI cannot read: every turn ` +
      `written to \`${d.liveSubtreeSessionId}.jsonl\` since the divergence began ` +
      `is missing from the conversation view, silently. This is the failure mode ` +
      `\`research/2026-07-09-conversations-session-chain.md\` was written to ` +
      `close — a standing report here means a **new handoff shape** is defeating ` +
      `the fix, not that the fix regressed on the known one.`,
  );
  lines.push("");
  lines.push(`**Triage**`);
  lines.push(
    `1. Confirm on the host: \`ps -axo pid=,ppid=\` from the pane pid down, then ` +
      `\`ls -l ~/.claude/sessions/<pid>.json\` for each descendant. Which pid owns ` +
      `\`${d.liveSubtreeSessionId}\`, and how deep is it below \`pane_pid\`?`,
  );
  lines.push(
    `2. Ask why the poller never recorded it — \`resolveSessionState\` picks the ` +
      `most recently written sessions file **within the subtree**, so either the ` +
      `live session's file is not in the subtree (a new detachment shape), or it ` +
      `is being written less recently than a tombstone (an mtime inversion).`,
  );
  lines.push(
    `3. Recover the lost turns by appending \`${d.liveSubtreeSessionId}\` to this ` +
      `conversation's chain (mid-chain recovery is manual per incident, by design).`,
  );
  lines.push("");
  lines.push(`**Conversation:** \`${d.conversationId}\``);
  lines.push(`**Chain tail session:** \`${d.chainTailSessionId}\``);
  lines.push(`**Live subtree session:** \`${d.liveSubtreeSessionId}\``);
  lines.push(
    `**Tail transcript mtime:** ${new Date(d.tailMtimeMs).toISOString()}`,
  );
  lines.push(
    `**Live transcript mtime:** ${new Date(d.liveMtimeMs).toISOString()}`,
  );
  lines.push(`**Lead:** ${formatLead(leadMs)}`);
  lines.push("");
  lines.push(`**Occurrences:** ${row.count}`);
  lines.push(`**Worktree:** ${row.worktree}`);
  lines.push(`**First seen:** ${row.firstSeenAt.toISOString()}`);
  lines.push(`**Last seen:** ${row.lastSeenAt.toISOString()}`);
  return lines.join("\n");
}
