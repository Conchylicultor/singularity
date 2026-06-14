import { eq, sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { runWithoutProfiling } from "@plugins/infra/plugins/runtime-profiler/core";
import { getServerBuildId } from "@plugins/build/server";
import { createTask, getTask } from "@plugins/tasks/plugins/tasks-core/server";
import { recordNotification } from "@plugins/shell/plugins/notifications/server";
import { _reports } from "./tables";
import { reportsResource } from "./resources";
import { bumpWindowAndCheck } from "./velocity";
import { isNoiseReport } from "./noise-rules";
import { REPORTS_META_TASK_ID } from "./meta-reports";
import { ReportKind } from "./report-kinds";
import type { ReportInput } from "../../shared/types";

export interface RecordReportResult {
  taskId: string | null;
  wasNew: boolean;
  rateLimited: boolean;
}

// The generic one-line summary is unbounded (an aggregated error can be hundreds
// of KB). Clamp it at the ingestion boundary so nothing downstream — the row,
// the notification, the task title — can ever exceed this. Kind-specific payload
// (stack, etc.) is clamped by the kind's renderTask when it builds the task
// description, where the ballooning actually hurt (markdown render).
const MESSAGE_MAX = 4_000;

// Truncate the middle, keeping head + tail. The closing context of an aggregated
// error matters as much as the opening, so we drop the redundant middle.
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

// The noise pipeline classifies on a small, generic shape. Crash-shaped fields
// (errorType / stack) that noise rules inspect live in the kind's `data` payload;
// we surface them here as plain strings if present. A kind that has no such
// fields simply yields nulls and matches no crash-specific noise rule.
function noiseFieldsFrom(data: Record<string, unknown>): {
  errorType: string | null;
  stack: string | null;
} {
  const errorType = typeof data.errorType === "string" ? data.errorType : null;
  const stack = typeof data.stack === "string" ? data.stack : null;
  return { errorType, stack };
}

// Single entry point used by the HTTP handler, the boot-time flush, and the
// process-level crash hooks. Every source collapses here so dedup + task-creation
// logic lives in one place. The engine is fully generic: it looks up the matching
// ReportKindSpec and delegates schema validation, fingerprinting, presentation,
// and task rendering to it. It never names a kind.
export async function recordReport(
  input: ReportInput,
): Promise<RecordReportResult> {
  const { kind, source, message: rawMessage, url, userAgent, clientId, buildId } =
    input;

  const spec = ReportKind.getContributions().find((k) => k.kind === kind);
  if (!spec) {
    // Fail loudly: a report whose kind has no registered spec is a wiring bug,
    // not a runtime condition to paper over with a default.
    throw new Error(
      `recordReport: no ReportKind registered for kind "${kind}". ` +
        `Registered kinds: ${ReportKind.getContributions()
          .map((k) => k.kind)
          .join(", ") || "(none)"}`,
    );
  }

  // Validate the per-kind payload against the kind's schema. parse() throws on a
  // malformed payload — again, a wiring bug we want surfaced, not swallowed. We
  // store the wire-level `data` (already a Record) so the persisted jsonb keeps
  // the exact shape the kind validated.
  const data = input.data;
  const parsed = spec.schema.parse(data);
  const fp = await spec.fingerprint(parsed);
  const worktree = process.env.SINGULARITY_WORKTREE ?? "unknown";
  const message = clamp(rawMessage ?? "", MESSAGE_MAX);
  const limited = bumpWindowAndCheck(fp);
  // A report whose originating bundle's build id differs from the server's
  // current build id came from an outdated frontend tab — benign version-skew.
  const serverBuildId = getServerBuildId();
  const staleOrigin =
    buildId != null && serverBuildId != null && buildId !== serverBuildId;
  const { errorType, stack } = noiseFieldsFrom(data);
  const noise = isNoiseReport({
    source,
    errorType,
    message: rawMessage ?? "",
    stack,
    staleOrigin,
  });

  const id = `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Wrapped in runWithoutProfiling: the reports insert/upsert is itself a `db`
  // span that would otherwise re-feed the slow-op recorder, which then files a
  // report, which writes again — a self-amplifying loop. Suppressing here covers
  // every report kind (crash + slow-op). The ALS propagates through the awaited
  // query, so the connection-acquire and query spans are suppressed too.
  const [row] = await runWithoutProfiling(async () => {
    // The await MUST run inside the suppression scope. A bare `() => db…`
    // returns the lazy query unexecuted, so its execution (and the acquire +
    // query spans) would run after the ALS scope exits — defeating suppression
    // and re-opening the self-feedback loop.
    const rows = await db
      .insert(_reports)
      .values({
        id,
        kind,
        fingerprint: fp,
        worktree,
        source,
        message,
        url: url ?? null,
        userAgent: userAgent ?? null,
        data,
        rateLimited: limited,
        noise,
        lastClientId: clientId ?? null,
        lastBuildId: buildId ?? null,
      })
      .onConflictDoUpdate({
        target: [_reports.fingerprint, _reports.worktree],
        // Repeats land on the same row (the fingerprint is stable per kind): bump
        // the count, refresh the latest message + payload + attribution.
        set: {
          message,
          data,
          count: sql`${_reports.count} + 1`,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
          rateLimited: sql`${_reports.rateLimited} OR ${limited}`,
          noise,
          lastClientId: clientId ?? null,
          lastBuildId: buildId ?? null,
        },
      })
      .returning();
    return rows;
  });

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) return { taskId: null, wasNew: false, rateLimited: limited };

  // Gate on the per-call `limited`, NOT the persisted `row.rateLimited`. The
  // throttle is ephemeral by design (see velocity.ts) — it suppresses task/bell
  // churn only while a fingerprint is actively bursting. `row.rateLimited` is an
  // OR-accumulated display flag ("was ever rate-limited") that is never reset, so
  // gating on it would permanently mute any long-lived singleton fingerprint
  // (e.g. the slow-op rollup) after its first burst.
  if (limited) {
    // Keep the row's count accurate but don't churn the task or the bus.
    reportsResource.notify();
    return { taskId: row.taskId, wasNew: false, rateLimited: true };
  }

  const outcome = await ensureTaskForReport(row.id, `${fp}|${worktree}`, spec);
  reportsResource.notify();
  // Mirror the task title's "[Stale tab]" marker into the bell so the
  // notification itself reads as benign version-skew at a glance.
  const stalePrefix = staleOrigin ? "[Stale tab] " : "";
  const desc = `${stalePrefix}${row.message}`;
  // Notification dedup granularity is the kind's re-arm policy. Without a
  // cooldown (default) the bell row is keyed by the stable report id — one row
  // per fingerprint that updates in place and never resurfaces once read (right
  // for crashes: one tracked task per distinct crash). With a cooldown, the key
  // also carries the current time bucket, so each window starts a fresh unread
  // row while reports inside the window collapse onto it — re-alert without spam
  // (right for slow ops: a recurring metric, not a one-shot incident).
  const cooldownMs = spec.meta.notifCooldownMs;
  const notifDedupeKey = cooldownMs
    ? `${row.id}:${Math.floor(Date.now() / cooldownMs)}`
    : row.id;
  void recordNotification({
    type: "report",
    title: staleOrigin ? `${spec.meta.notif} (stale tab)` : spec.meta.notif,
    description: desc.length > 140 ? `${desc.slice(0, 137)}...` : desc,
    variant: spec.meta.variant,
    muted: row.noise,
    dedupeKey: notifDedupeKey,
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
  return { ...outcome, rateLimited: false };
}

async function ensureTaskForReport(
  reportId: string,
  lockKey: string,
  spec: { meta: { tag: string }; renderTask: (row: typeof _reports.$inferSelect) => { title: string; description: string } },
): Promise<{ taskId: string | null; wasNew: boolean }> {
  // Serialize concurrent callers for the same fingerprint. A request arriving
  // while another is mid-creation waits on the prior promise, then re-reads the
  // row and observes the task already linked.
  while (taskCreationLocks.has(lockKey)) {
    await taskCreationLocks.get(lockKey);
  }
  let release!: () => void;
  const inflight = new Promise<void>((r) => (release = r));
  taskCreationLocks.set(lockKey, inflight);

  try {
    // The task-creation DB work (select + getTask + createTask + update) is part
    // of the observability subsystem's own I/O — suppress its spans so they never
    // re-feed the slow-op recorder. The suppression ALS propagates through every
    // awaited query, including the cross-plugin getTask/createTask DB calls.
    return await runWithoutProfiling(async () => {
      const [latest] = await db
        .select()
        .from(_reports)
        .where(eq(_reports.id, reportId))
        .limit(1);
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
      if (!latest) return { taskId: null, wasNew: false };

      const linked = latest.taskId ? await getTask(latest.taskId) : null;
      const needsTask = !linked || linked.status === "dropped";
      if (!needsTask) return { taskId: latest.taskId, wasNew: false };

      const { title, description } = spec.renderTask(latest);
      const task = await createTask({
        folderId: REPORTS_META_TASK_ID,
        title,
        description,
        author: "reports-plugin",
      });
      await db
        .update(_reports)
        .set({ taskId: task.id, updatedAt: new Date() })
        .where(eq(_reports.id, latest.id));
      return { taskId: task.id, wasNew: true };
    });
  } finally {
    taskCreationLocks.delete(lockKey);
    release();
  }
}
