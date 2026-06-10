import { eq, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { getServerBuildId } from "@plugins/build/server";
import { createTask, getTask } from "@plugins/tasks-core/server";
import { recordNotification } from "@plugins/notifications/server";
import { _crashes } from "./tables";
import { crashesResource } from "./resources";
import { bumpWindowAndCheck } from "./velocity";
import { isNoiseCrash } from "./noise-rules";
import { CRASHES_META_TASK_ID } from "./meta-crashes";
import { fingerprint as fingerprintOf } from "../../shared/fingerprint";
import type { CrashReport } from "../../shared/types";

export interface RecordCrashResult {
  taskId: string | null;
  wasNew: boolean;
  crashLoop: boolean;
}

// Crash payloads are unbounded: an aggregated error (e.g. a ZodError listing one
// issue per row across thousands of rows) can be hundreds of KB. Persisting that
// verbatim balloons the crash row, the derived task description, and ultimately
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

// Single entry point used by the HTTP handler, the boot-time flush, and the
// process-level crash hooks (once the next boot flushes them through).
// Every source collapses here so dedup + task-creation logic lives in one place.
export async function recordCrash(
  input: CrashReport,
): Promise<RecordCrashResult> {
  const fp = await fingerprintOf(input.errorType, input.stack);
  const worktree = process.env.SINGULARITY_WORKTREE ?? "unknown";
  const message = clamp(input.message, MESSAGE_MAX);
  const stack = input.stack != null ? clamp(input.stack, STACK_MAX) : null;
  const componentStack =
    input.componentStack != null
      ? clamp(input.componentStack, COMPONENT_STACK_MAX)
      : null;
  const loop = bumpWindowAndCheck(fp);
  // A crash whose originating bundle's build id differs from the server's
  // current build id came from an outdated frontend tab — benign version-skew.
  const serverBuildId = getServerBuildId();
  const staleOrigin =
    input.buildId != null &&
    serverBuildId != null &&
    input.buildId !== serverBuildId;
  const noise = isNoiseCrash({
    source: input.source,
    errorType: input.errorType ?? null,
    message: input.message,
    stack: input.stack ?? null,
    staleOrigin,
  });

  const id = `crash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [row] = await db
    .insert(_crashes)
    .values({
      id,
      fingerprint: fp,
      worktree,
      source: input.source,
      errorType: input.errorType ?? null,
      message,
      stack,
      componentStack,
      url: input.url ?? null,
      userAgent: input.userAgent ?? null,
      slot: input.slot ?? null,
      label: input.label ?? null,
      crashLoop: loop,
      noise,
      lastClientId: input.clientId ?? null,
      lastBuildId: input.buildId ?? null,
    })
    .onConflictDoUpdate({
      target: [_crashes.fingerprint, _crashes.worktree],
      set: {
        count: sql`${_crashes.count} + 1`,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
        crashLoop: sql`${_crashes.crashLoop} OR ${loop}`,
        noise,
        lastClientId: input.clientId ?? null,
        lastBuildId: input.buildId ?? null,
      },
    })
    .returning();

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) return { taskId: null, wasNew: false, crashLoop: loop };

  if (row.crashLoop) {
    // Keep the row's count accurate but don't churn the task or the bus.
    crashesResource.notify();
    return { taskId: row.taskId, wasNew: false, crashLoop: true };
  }

  const outcome = await ensureTaskForCrash(row.id, `${fp}|${worktree}`, {
    staleOrigin,
    serverBuildId,
  });
  crashesResource.notify();
  const desc = row.errorType
    ? `${row.errorType}: ${row.message}`
    : row.message;
  void recordNotification({
    type: "crash",
    title: "Crash recorded",
    description: desc.length > 140 ? `${desc.slice(0, 137)}...` : desc,
    variant: "error",
    muted: row.noise,
    linkTo: outcome.taskId ? `/tasks/t/${outcome.taskId}` : null,
    metadata: {
      crashId: row.id,
      taskId: outcome.taskId,
      source: row.source,
      fingerprint: fp,
      clientId: input.clientId ?? null,
      buildId: input.buildId ?? null,
    },
  });
  return { ...outcome, crashLoop: false };
}

async function ensureTaskForCrash(
  crashId: string,
  lockKey: string,
  origin: { staleOrigin: boolean; serverBuildId: string | null },
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
      .from(_crashes)
      .where(eq(_crashes.id, crashId))
      .limit(1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
    if (!latest) return { taskId: null, wasNew: false };

    const linked = latest.taskId ? await getTask(latest.taskId) : null;
    const recurrence = !!latest.taskId;
    const needsTask = !linked || linked.status === "dropped";
    if (!needsTask) return { taskId: latest.taskId, wasNew: false };

    const task = await createTask({
      folderId: CRASHES_META_TASK_ID,
      title: taskTitle(latest, origin.staleOrigin),
      description: taskDescription(
        latest,
        recurrence,
        origin.staleOrigin,
        origin.serverBuildId,
      ),
      author: "crashes-plugin",
    });
    await db
      .update(_crashes)
      .set({ taskId: task.id, updatedAt: new Date() })
      .where(eq(_crashes.id, latest.id));
    return { taskId: task.id, wasNew: true };
  } finally {
    taskCreationLocks.delete(lockKey);
    release();
  }
}

function taskTitle(
  row: { errorType: string | null; message: string },
  staleOrigin: boolean,
): string {
  const prefix = row.errorType ? `${row.errorType}: ` : "";
  const stalePrefix = staleOrigin ? "[Stale tab] " : "";
  const raw = `${stalePrefix}[crash] ${prefix}${row.message}`;
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
  },
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
