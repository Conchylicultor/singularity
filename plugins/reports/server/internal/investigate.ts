import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { runWithoutProfiling } from "@plugins/infra/plugins/runtime-profiler/core";
import { _reports } from "./tables";
import { reportInvestigationSink } from "./investigation-sink";
import { ReportKind } from "./report-kinds";

// Appended to every report-filed task. The agent that picks one up is about to
// debug, so point them at the debugging map first — it routes them to the right
// surface (durable slow-op store, runtime profiler, pg_stat_activity) instead of
// guessing.
const DEBUG_SKILL_HINT =
  "> Before debugging, read the `debug` skill (`.claude/skills/debug/SKILL.md`) — the map of logs, profiling, slow-ops, crashes, and DB surfaces.";

// Per-reportId in-process mutex. Serialising at the JS layer avoids DB row locks
// saturating the connection pool, and lets a second concurrent caller observe
// the task already linked instead of racing to create a duplicate.
const taskCreationLocks = new Map<string, Promise<void>>();

// On-demand investigation: the ONLY place that now turns a report into a task.
// The task-creating handler is registered softly by the tasks domain into
// `reportInvestigationSink` — a composition without tasks has no handler, so
// emit() returns undefined and this throws loudly. Idempotency (a report already
// linked to a live task) is enforced by the registered handler.
export async function investigateReport(
  reportId: string,
): Promise<{ taskId: string }> {
  // Serialize concurrent callers for the same report. A request arriving while
  // another is mid-creation waits on the prior promise, then re-reads the row
  // and observes the task already linked.
  while (taskCreationLocks.has(reportId)) {
    await taskCreationLocks.get(reportId);
  }
  let release!: () => void;
  const inflight = new Promise<void>((r) => (release = r));
  taskCreationLocks.set(reportId, inflight);

  try {
    // The task-creation DB work (select + the handler's getTask/createTask) is
    // part of the observability subsystem's own I/O — suppress its spans so they
    // never re-feed the slow-op recorder. The suppression ALS propagates through
    // every awaited query, including across the awaited sink emit into the
    // handler's cross-plugin getTask/createTask DB calls.
    return await runWithoutProfiling(async () => {
      const [row] = await db
        .select()
        .from(_reports)
        .where(eq(_reports.id, reportId))
        .limit(1);
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
      if (!row) {
        throw new Error(`investigateReport: no report found for id "${reportId}"`);
      }

      const spec = ReportKind.getContributions().find((k) => k.kind === row.kind);
      if (!spec) {
        // A persisted report whose kind has no registered spec is a wiring bug,
        // not a runtime condition to paper over.
        throw new Error(
          `investigateReport: no ReportKind registered for kind "${row.kind}"`,
        );
      }

      const { title, description } = spec.renderTask(row);
      const result = await reportInvestigationSink.emit({
        existingTaskId: row.taskId,
        title,
        description: `${description}\n\n${DEBUG_SKILL_HINT}`,
        author: "reports-plugin",
      });
      if (!result) {
        throw new Error(
          "investigateReport: no investigation-task handler registered (tasks capability absent in this composition)",
        );
      }
      if (result.taskId !== row.taskId) {
        await db
          .update(_reports)
          .set({ taskId: result.taskId, updatedAt: new Date() })
          .where(eq(_reports.id, row.id));
      }
      return { taskId: result.taskId };
    });
  } finally {
    taskCreationLocks.delete(reportId);
    release();
  }
}
