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
    if (d.reap === undefined || d.reap.outcome === "disabled") {
      lines.push("");
      lines.push(
        `**The process is still alive and was NOT killed** — attach to pid ${d.pid} ` +
          `by hand now (\`sample ${d.pid} 10\`, \`ps -o pid,ppid,stat,%cpu,etime,command\`, ` +
          `\`lsof -p ${d.pid}\`) while the specimen is intact.`,
      );
    }
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
    if (d.reap === undefined || d.reap.outcome === "disabled") {
      lines.push("");
      lines.push(
        `**The wedged process was NOT killed** (reap disabled) — the live specimen is ` +
          `still attached. Read \`${c.dumpPath}\` (thread states, open fds, the op ` +
          `marker) before reaping it by hand.`,
      );
    }
  }

  renderJsProbe(lines, d);
  renderReap(lines, d);

  lines.push("");
  lines.push(`**Occurrences (watchdog sightings):** ${row.count}`);
  lines.push(`**First seen:** ${row.firstSeenAt.toISOString()}`);
  lines.push(`**Last seen:** ${row.lastSeenAt.toISOString()}`);
  return lines.join("\n");
}

// The known wedge signature: a native microtask storm drained by
// `processTicksAndRejections` at its `drainMicrotasks()` call site (bc#365 on
// bun 1.3.13). A dominant stack matching this names THIS bug; anything else is
// a new specimen worth its own investigation.
const KNOWN_DRAIN_FRAME = "processTicksAndRejections";

function renderJsProbe(lines: string[], d: OpWedgePayload): void {
  const p = d.jsProbe;
  lines.push("");
  if (p === undefined) {
    lines.push(
      `## JS interrogation: SKIPPED\n\nDisabled (Settings → Config → op-wedge-watchdog → ` +
        `"JS interrogation"). The hot-function evidence this report exists to collect ` +
        `was not gathered.`,
    );
    return;
  }
  if (!p.armed) {
    lines.push(
      `## JS interrogation: NOT POSSIBLE\n\nThe op marker carries no inspector URL — ` +
        `the op's worktree predates the pre-armed inspector (12efa0e37) or arming was ` +
        `disabled. Only native forensics exist for this wedge.`,
    );
    return;
  }
  const partial = p.failures.length > 0;
  lines.push(`## JS interrogation${partial ? " — ⚠️ PARTIAL" : ""}`);
  lines.push("");
  if (partial) {
    lines.push(`**${p.failures.length} step(s) FAILED — do not read an absent section as an absent finding.**`);
    for (const f of p.failures) lines.push(`- \`${f.step}\`: ${f.error}`);
    lines.push("");
  }
  lines.push(
    `**Sampled JS traces over the probe window: ${p.traceCount ?? "unknown"}.** ` +
      `(A native microtask storm yields only a handful — the burn is below JS.)`,
  );
  if (p.topStacks.length > 0) {
    lines.push("");
    lines.push("| count | stack (leaf < caller < …) |");
    lines.push("|---|---|");
    for (const s of p.topStacks.slice(0, 10)) {
      lines.push(`| ${s.count} | \`${s.stack}\` |`);
    }
    const dominant = p.topStacks[0];
    if (dominant !== undefined && dominant.stack.includes(KNOWN_DRAIN_FRAME)) {
      lines.push("");
      lines.push(
        `**Dominant stack matches the KNOWN wedge signature** (native microtask storm ` +
          `drained by \`processTicksAndRejections\` — the drainMicrotasks() call site). ` +
          `See \`research/2026-07-22-global-cli-op-wedge-named-function.md\`; the raw ` +
          `interrogation JSON (incl. protected-object histogram and the paired lsofs) ` +
          `is in the capture dump.`,
      );
    }
  }
  if (p.heapDelta !== null) {
    lines.push("");
    lines.push(
      `**Heap delta over ${p.heapDelta.wallMs}ms:** ${p.heapDelta.heapBytes} bytes, ` +
        `${p.heapDelta.objects} objects. (~zero for the known storm — it allocates nothing.)`,
    );
  }
}

function renderReap(lines: string[], d: OpWedgePayload): void {
  const r = d.reap;
  if (r === undefined) return; // legacy row from before the reap policy
  lines.push("");
  lines.push(`## Reap`);
  lines.push("");
  switch (r.outcome) {
    case "disabled":
      lines.push(
        `Reap is **disabled** (Settings → Config → op-wedge-watchdog → "Reap after ` +
          `capture") — pid ${d.pid} was left alive and the fleet stays serialised ` +
          `behind it until it is reaped by hand.`,
      );
      break;
    case "already-dead":
      lines.push(`Pid ${d.pid} was already gone before the reap step — nothing to kill.`);
      break;
    case "exited-sigterm":
      lines.push(`Pid ${d.pid} exited on **SIGTERM** (graceful path) — locks and marker self-healed.`);
      break;
    case "exited-sigkill":
      lines.push(
        `Pid ${d.pid} ignored SIGTERM (matches upstream oven-sh/bun#27766) and was ` +
          `**SIGKILLed** — flocks auto-released; the marker self-heals on the next read.`,
      );
      break;
    case "survived":
      lines.push(
        `⚠️ Pid ${d.pid} is **still alive after SIGKILL** — this should be impossible ` +
          `(uninterruptible kernel state?). Investigate by hand immediately.`,
      );
      break;
  }
  for (const f of r.failures) lines.push(`- \`${f.step}\`: ${f.error}`);
}
