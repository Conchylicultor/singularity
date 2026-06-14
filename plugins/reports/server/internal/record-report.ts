import { eq, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { getServerBuildId } from "@plugins/build/server";
import { createTask, getTask } from "@plugins/tasks/plugins/tasks-core/server";
import { recordNotification } from "@plugins/shell/plugins/notifications/server";
import { _reports } from "./tables";
import { reportsResource } from "./resources";
import { bumpWindowAndCheck } from "./velocity";
import { isNoiseReport } from "./noise-rules";
import { REPORTS_META_TASK_ID } from "./meta-reports";
import {
  fingerprint as fingerprintOf,
  fingerprintSlowOp,
} from "../../shared/fingerprint";
import type { ReportInput } from "../../shared/types";

export interface RecordReportResult {
  taskId: string | null;
  wasNew: boolean;
  crashLoop: boolean;
}

// Report payloads are unbounded: an aggregated error (e.g. a ZodError listing one
// issue per row across thousands of rows) can be hundreds of KB. Persisting that
// verbatim balloons the report row, the derived task description, and ultimately
// hangs the markdown renderer when the task is opened. Clamp every free-text
// field at the ingestion boundary so nothing downstream can ever exceed these.
const MESSAGE_MAX = 4_000;
const STACK_MAX = 16_000;
const COMPONENT_STACK_MAX = 8_000;

// Truncate the middle, keeping head + tail. For stacks the innermost frames
// (the tail) are usually the root cause; for aggregated errors the closing
// context matters too — so we drop the redundant middle, not the end.
function clamp(value: string, max: number): string {
  if (value.length <= max) return value;
  const head = Math.ceil(max / 2);
  const tail = max - head;
  const omitted = value.length - max;
  return `${value.slice(0, head)}\n… [truncated ${omitted} chars] …\n${value.slice(value.length - tail)}`;
}

// Per-(fingerprint|worktree) in-process mutex. Serialising at the JS layer
// avoids DB row locks saturating the connection pool under cold-start bursts.
const taskCreationLocks = new Map<string, Promise<void>>();

// Per-kind presentation labels for the task title tag and the bell notification.
// Unknown kinds fall back to crash so a new kind never produces a blank label.
const KIND_META = {
  crash: { tag: "[crash]", notif: "Crash recorded", variant: "error" },
  "slow-op": {
    tag: "[slow-op]",
    notif: "Slow operation recorded",
    variant: "warning",
  },
} as const;

// Single entry point used by the HTTP handler, the boot-time flush, and the
// process-level crash hooks (once the next boot flushes them through).
// Every source collapses here so dedup + task-creation logic lives in one place.
export async function recordReport(
  input: ReportInput,
): Promise<RecordReportResult> {
  // Split the report into the fields that transform on the way to the row
  // (clamped text, renamed attribution) and the verbatim ones that map 1:1 to
  // columns of the same name. Spreading `verbatim` into the insert means a new
  // plain report field persists automatically instead of being silently dropped
  // by a hand-written column list — the only fields named explicitly below are
  // the ones that genuinely differ from the report shape.
  const {
    kind: rawKind,
    message: rawMessage,
    stack: rawStack,
    componentStack: rawComponentStack,
    clientId,
    buildId,
    ...verbatim
  } = input;

  const kind = rawKind ?? "crash";
  const meta = KIND_META[kind as keyof typeof KIND_META] ?? KIND_META.crash;
  const fp =
    kind === "slow-op"
      ? await fingerprintSlowOp(input.operationKind ?? "", input.operation ?? "")
      : await fingerprintOf(input.errorType, input.stack);
  const worktree = process.env.SINGULARITY_WORKTREE ?? "unknown";
  const message = clamp(rawMessage, MESSAGE_MAX);
  const stack = rawStack != null ? clamp(rawStack, STACK_MAX) : null;
  const componentStack =
    rawComponentStack != null
      ? clamp(rawComponentStack, COMPONENT_STACK_MAX)
      : null;
  const loop = bumpWindowAndCheck(fp);
  // A crash whose originating bundle's build id differs from the server's
  // current build id came from an outdated frontend tab — benign version-skew.
  const serverBuildId = getServerBuildId();
  const staleOrigin =
    buildId != null && serverBuildId != null && buildId !== serverBuildId;
  const noise = isNoiseReport({
    source: input.source,
    errorType: input.errorType ?? null,
    message: input.message,
    stack: input.stack ?? null,
    staleOrigin,
  });

  const id = `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [row] = await db
    .insert(_reports)
    .values({
      id,
      kind,
      fingerprint: fp,
      worktree,
      // source, errorType, url, userAgent, slot, label — map 1:1 to columns.
      ...verbatim,
      // Clamped text + renamed last-writer-wins attribution columns.
      message,
      stack,
      componentStack,
      crashLoop: loop,
      noise,
      lastClientId: clientId ?? null,
      lastBuildId: buildId ?? null,
    })
    .onConflictDoUpdate({
      target: [_reports.fingerprint, _reports.worktree],
      // Slow-op rows also refresh duration/threshold to the latest occurrence
      // (the fingerprint excludes duration, so repeats land on the same row);
      // crash rows leave these columns NULL.
      set: {
        count: sql`${_reports.count} + 1`,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
        crashLoop: sql`${_reports.crashLoop} OR ${loop}`,
        noise,
        lastClientId: clientId ?? null,
        lastBuildId: buildId ?? null,
        ...(kind === "slow-op"
          ? {
              durationMs: input.durationMs ?? null,
              thresholdMs: input.thresholdMs ?? null,
            }
          : {}),
      },
    })
    .returning();

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) return { taskId: null, wasNew: false, crashLoop: loop };

  if (row.crashLoop) {
    // Keep the row's count accurate but don't churn the task or the bus.
    reportsResource.notify();
    return { taskId: row.taskId, wasNew: false, crashLoop: true };
  }

  const outcome = await ensureTaskForReport(row.id, `${fp}|${worktree}`, {
    kind,
    tag: meta.tag,
    staleOrigin,
    serverBuildId,
  });
  reportsResource.notify();
  // Mirror the task title's "[Stale tab]" marker into the bell so the
  // notification itself reads as benign version-skew at a glance — not just the
  // task it links to. (Restart-induced wedges self-describe in their message.)
  const stalePrefix = staleOrigin ? "[Stale tab] " : "";
  const body = row.errorType
    ? `${row.errorType}: ${row.message}`
    : row.message;
  const desc = `${stalePrefix}${body}`;
  void recordNotification({
    type: "report",
    title: staleOrigin ? `${meta.notif} (stale tab)` : meta.notif,
    description: desc.length > 140 ? `${desc.slice(0, 137)}...` : desc,
    variant: meta.variant,
    muted: row.noise,
    // One bell row per report fingerprint, mirroring the deduped report row (and
    // its single growing-count task). `row.id` is stable across occurrences —
    // the upsert keyed on (fingerprint, worktree) returns the same row — so each
    // recurrence refreshes this one notification in place, keeping its `muted`
    // in sync with the row's latest last-writer-wins noise instead of inserting
    // a fresh, frozen-classification row every time.
    dedupeKey: row.id,
    linkTo: outcome.taskId ? `/tasks/t/${outcome.taskId}` : null,
    metadata: {
      reportId: row.id,
      taskId: outcome.taskId,
      source: row.source,
      fingerprint: fp,
      clientId: clientId ?? null,
      buildId: buildId ?? null,
    },
  });
  return { ...outcome, crashLoop: false };
}

async function ensureTaskForReport(
  reportId: string,
  lockKey: string,
  origin: {
    kind: string;
    tag: string;
    staleOrigin: boolean;
    serverBuildId: string | null;
  },
): Promise<{ taskId: string | null; wasNew: boolean }> {
  // Serialize concurrent callers for the same fingerprint. A request arriving
  // while another is mid-creation waits on the prior promise, then re-reads
  // the row and observes the task already linked.
  while (taskCreationLocks.has(lockKey)) {
    await taskCreationLocks.get(lockKey);
  }
  let release!: () => void;
  const inflight = new Promise<void>((r) => (release = r));
  taskCreationLocks.set(lockKey, inflight);

  try {
    const [latest] = await db
      .select()
      .from(_reports)
      .where(eq(_reports.id, reportId))
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (!latest) return { taskId: null, wasNew: false };

    const linked = latest.taskId ? await getTask(latest.taskId) : null;
    const recurrence = !!latest.taskId;
    const needsTask = !linked || linked.status === "dropped";
    if (!needsTask) return { taskId: latest.taskId, wasNew: false };

    const task = await createTask({
      folderId: REPORTS_META_TASK_ID,
      title: taskTitle(latest, origin.tag, origin.staleOrigin, latest.noise),
      description: taskDescription(
        latest,
        origin.kind,
        recurrence,
        origin.staleOrigin,
        origin.serverBuildId,
      ),
      author: "reports-plugin",
    });
    await db
      .update(_reports)
      .set({ taskId: task.id, updatedAt: new Date() })
      .where(eq(_reports.id, latest.id));
    return { taskId: task.id, wasNew: true };
  } finally {
    taskCreationLocks.delete(lockKey);
    release();
  }
}

function taskTitle(
  row: { errorType: string | null; message: string },
  tag: string,
  staleOrigin: boolean,
  noise: boolean,
): string {
  const prefix = row.errorType ? `${row.errorType}: ` : "";
  const stalePrefix = staleOrigin ? "[Stale tab] " : "";
  // Tag known-benign noise so the title itself reads as "expected", matching
  // the muted notification — not just a dimmed row with no explanation.
  const noisePrefix = noise ? "[noise] " : "";
  const raw = `${stalePrefix}${noisePrefix}${tag} ${prefix}${row.message}`;
  return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
}

function taskDescription(
  row: {
    source: string;
    worktree: string;
    fingerprint: string;
    count: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
    stack: string | null;
    componentStack: string | null;
    url: string | null;
    userAgent: string | null;
    slot: string | null;
    label: string | null;
    message: string;
    errorType: string | null;
    lastBuildId: string | null;
    operationKind: string | null;
    operation: string | null;
    durationMs: number | null;
    thresholdMs: number | null;
  },
  kind: string,
  recurrence: boolean,
  staleOrigin: boolean,
  serverBuildId: string | null,
): string {
  const lines: string[] = [];
  if (staleOrigin) {
    lines.push(
      `**Origin:** stale frontend tab (build ${row.lastBuildId} vs current ${serverBuildId}) — likely benign version-skew, not a live bug.`,
    );
    lines.push("");
  }
  if (recurrence) {
    lines.push(
      `**Recurrence** — this fingerprint previously had a task that was dropped. It just happened again.`,
    );
    lines.push("");
  }
  // Slow-op: no stack, no error fence — surface the operation identity and the
  // duration vs threshold that tripped the report. Crash-only blocks (slot,
  // componentStack, error fence) don't apply.
  if (kind === "slow-op") {
    lines.push(`**Operation**`);
    lines.push(`**operationKind:** ${row.operationKind ?? "unknown"}`);
    lines.push(`**operation:** ${row.operation ?? "unknown"}`);
    lines.push(
      `**Duration:** ${row.durationMs} ms (threshold ${row.thresholdMs} ms)`,
    );
    lines.push("");
    lines.push(`**Source:** ${row.source}`);
    lines.push(`**Worktree:** ${row.worktree}`);
    lines.push(`**Fingerprint:** ${row.fingerprint}`);
    lines.push(`**Count:** ${row.count}`);
    lines.push(`**First seen:** ${row.firstSeenAt.toISOString()}`);
    lines.push(`**Last seen:** ${row.lastSeenAt.toISOString()}`);
    if (row.url) lines.push(`**URL:** ${row.url}`);
    return lines.join("\n");
  }
  lines.push(`**Source:** ${row.source}`);
  lines.push(`**Worktree:** ${row.worktree}`);
  lines.push(`**Fingerprint:** ${row.fingerprint}`);
  lines.push(`**Count:** ${row.count}`);
  lines.push(`**First seen:** ${row.firstSeenAt.toISOString()}`);
  lines.push(`**Last seen:** ${row.lastSeenAt.toISOString()}`);
  if (row.slot) {
    const suffix = row.label ? ` (label: ${row.label})` : "";
    lines.push(`**Slot:** ${row.slot}${suffix}`);
  }
  if (row.url) lines.push(`**URL:** ${row.url}`);
  if (row.userAgent) lines.push(`**User-Agent:** ${row.userAgent}`);
  lines.push("");
  lines.push(`**Error**`);
  lines.push("```");
  lines.push(`${row.errorType ?? "Error"}: ${row.message}`);
  if (row.stack) lines.push(row.stack);
  lines.push("```");
  if (row.componentStack) {
    lines.push("");
    lines.push("**Component stack**");
    lines.push("```");
    lines.push(row.componentStack);
    lines.push("```");
  }
  return lines.join("\n");
}
