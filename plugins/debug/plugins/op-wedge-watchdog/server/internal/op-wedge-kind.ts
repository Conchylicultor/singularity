import { ReportKind } from "@plugins/reports/server";
import type { ReportRow } from "@plugins/reports/server";
import { OpWedgePayloadSchema, type OpWedgePayload } from "../../core";

// Re-alert the bell at most once per ~15 min. In practice a wedge files exactly
// once (the monitor dedupes per (worktree, op, pid) — see monitor-job.ts), so
// this cooldown only matters across a main restart, where the same live wedge
// re-files onto the same fingerprint row.
const OP_WEDGE_NOTIF_COOLDOWN_MS = 15 * 60 * 1000;

// The `cli-op-wedge` report kind. Dedups per (worktree, op, pid) — the identity
// of the stuck PROCESS. The row's own `worktree` column is always `main` (the
// monitor job runs there), so the subject must live in the fingerprint.
//
// Variant `error`: a wedged CLI op holds host cpu-slots and, for a push, the
// global push mutex — it serialises every build and push on the machine. That
// is a live outage, not a cost regression.
//
// `duressExempt: true` — this watchdog exists PRECISELY to observe the box in
// trouble. A wedged `./singularity push` is itself a leading cause of host
// duress, so the duress shed gate would reliably drop the one report that
// explains the duress. The kind therefore declares itself exempt (the shed
// engine names no kind; a kind opts itself out).
export const opWedgeKind = ReportKind({
  kind: "cli-op-wedge",
  schema: OpWedgePayloadSchema,
  fingerprint: (d: OpWedgePayload) => `cli-op-wedge:${d.worktree}:${d.op}:${d.pid}`,
  duressExempt: true,
  meta: {
    tag: "[cli-op-wedge]",
    notif: "CLI op wedged",
    variant: "error",
    notifCooldownMs: OP_WEDGE_NOTIF_COOLDOWN_MS,
  },
  renderTask: (row: ReportRow) => {
    const d = OpWedgePayloadSchema.parse(row.data);
    return {
      title: `[cli-op-wedge] ${d.worktree} ${d.op} wedged ${humanMs(d.wedgedMs)} (pid ${d.pid})`,
      description: renderDescription(row, d),
    };
  },
});

function humanMs(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m`;
  return `${(m / 60).toFixed(1)}h`;
}

function renderDescription(row: ReportRow, d: OpWedgePayload): string {
  const lines: string[] = [];
  lines.push(
    `\`./singularity ${d.op}\` in worktree \`${d.worktree}\` (pid **${d.pid}**) has been ` +
      `running for **${humanMs(d.wedgedMs)}** — past its **${d.budgetMs}ms** budget. It ` +
      `started ${d.startedAt} and its op marker still names a live pid.`,
  );
  lines.push("");
  lines.push(
    `A wedged CLI op holds its host cpu-slots and — for a push, or a check nested ` +
      `in one — the global push mutex, serialising every build and push on the ` +
      `machine. See \`research/2026-07-20-global-cli-op-wedge-capture-watchdog.md\`; ` +
      `this report is the live-specimen capture that investigation asked for.`,
  );
  lines.push("");
  lines.push(`**Worktree:** \`${d.worktree}\``);
  lines.push(`**Op:** \`${d.op}\``);
  lines.push(`**Pid:** ${d.pid}`);
  lines.push(`**Started:** ${d.startedAt}`);
  lines.push(`**Wedged for:** ${d.wedgedMs}ms`);
  lines.push(`**Budget:** ${d.budgetMs}ms`);
  lines.push("");

  if (!d.capture) {
    lines.push(
      `## Capture: SKIPPED\n\nForensic capture is disabled (Settings → Config → ` +
        `op-wedge-watchdog → "Capture forensics"). **No evidence was collected for ` +
        `this wedge.** Re-enable it before the next occurrence; without the dump ` +
        `this report only records that a wedge happened, not why.`,
    );
    lines.push("");
    lines.push(
      `**The process is still alive and was NOT killed** — attach to pid ${d.pid} ` +
        `by hand now (\`sample ${d.pid} 10\`, \`ps -o pid,ppid,stat,%cpu,etime,command\`, ` +
        `\`lsof -p ${d.pid}\`) while the specimen is intact.`,
    );
  } else {
    const c = d.capture;
    const partial = c.failures.length > 0;
    lines.push(`## Capture${partial ? " — ⚠️ PARTIAL" : ""}`);
    lines.push("");
    if (partial) {
      lines.push(
        `**${c.failures.length} capture step(s) FAILED. This dump is incomplete — ` +
          `do not read an absent section as an absent finding.**`,
      );
      for (const f of c.failures) lines.push(`- \`${f.step}\`: ${f.error}`);
      lines.push("");
    }
    lines.push(`**Dump:** \`${c.dumpPath}\``);
    lines.push(`**Alive at end of capture:** ${c.alive ? "yes" : "no (exited mid-capture)"}`);
    lines.push("");
    lines.push(
      `**CPU verdict: \`${c.cpu.verdict}\`** — ${c.cpu.deltaMs}ms of CPU time consumed ` +
        `over a ${c.cpu.wallMs}ms wall window (ratio ${c.cpu.ratio.toFixed(3)}). This is a ` +
        `DELTA across two samples, not a single \`%CPU\` reading: the prior ` +
        `investigations' "~95-100% CPU, state R" was a misread of exactly that kind. ` +
        `\`idle\` means the process is parked in a blocking syscall — look for a handle ` +
        `or an \`await\` that never settles, not a busy loop.`,
    );
    lines.push("");
    lines.push(`### Child process tree (${c.children.length})`);
    if (c.children.length === 0) {
      lines.push("");
      lines.push(
        `No live children. **This is a finding, not an absence:** it rules out the ` +
          `leading hypothesis (a spawned \`git\` whose stdout never EOFs, leaving ` +
          `\`await new Response(proc.stdout).text()\` unsettled forever).`,
      );
    } else {
      lines.push("");
      lines.push("```");
      lines.push("PID     PPID    STAT  ETIME       COMMAND");
      for (const ch of c.children) {
        lines.push(
          `${String(ch.pid).padEnd(8)}${String(ch.ppid).padEnd(8)}${ch.state.padEnd(6)}${ch.etime.padEnd(12)}${ch.command}`,
        );
      }
      lines.push("```");
      lines.push("");
      lines.push(
        `**A live \`git\` child here is the answer.** It confirms the parent is parked ` +
          `awaiting a child that never EOFs its stdout — the untimed ` +
          `\`await new Response(proc.stdout).text()\` in \`grepCode\`→\`getRoot()\` ` +
          `(\`checks/core/grep-code.ts\`) and the \`orphaned-db-tables\` \`git()\` helper.`,
      );
    }
    lines.push("");
    lines.push(
      `**The wedged process was deliberately NOT killed** — the intact live specimen ` +
        `is the whole point. Read \`${c.dumpPath}\` (thread states, open fds, the op ` +
        `marker, the \`check-progress.jsonl\` tail) before reaping it.`,
    );
  }

  lines.push("");
  lines.push(`**Occurrences (watchdog sightings):** ${row.count}`);
  lines.push(`**First seen:** ${row.firstSeenAt.toISOString()}`);
  lines.push(`**Last seen:** ${row.lastSeenAt.toISOString()}`);
  return lines.join("\n");
}
