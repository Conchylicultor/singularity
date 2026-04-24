import { eq } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  makeWorkerUtils,
  run,
  type Runner,
  type WorkerUtils,
} from "graphile-worker";
import { connectionString, db } from "@server/db/client";
import { actionRegistry, triggerTableRegistry } from "./registry";

// Single shared task. Actions are resolved at invoke time via `actionRegistry`
// so adding an action at runtime (future) doesn't require restarting the
// worker. See research/2026-04-23-plugins-events-graphile-worker-v2.md §2.
export const DISPATCH_TASK = "events.dispatch";

// Retries are Graphile's job; we pick a small cap so permanently-broken
// handlers don't thrash the worker forever. Callers that need a different
// cap can override via `addJob`'s TaskSpec (wired through `emit`).
export const DEFAULT_MAX_ATTEMPTS = 5;

const CONCURRENCY = 4;

export interface DispatchPayload {
  actionName: string;
  actionConfig: unknown;
  eventPayload: unknown;
  triggerId: string;
  eventName: string;
  oneShot: boolean;
}

let runner: Runner | null = null;

// Lazy singleton. The first `emit()` call (which may land before
// `startWorker()` in the onReady cycle) initializes this; `makeWorkerUtils`
// runs Graphile's own migrations, which are idempotent and safe to race with
// the runner's init.
let workerUtilsPromise: Promise<WorkerUtils> | null = null;

export function getWorkerUtils(): Promise<WorkerUtils> {
  if (!workerUtilsPromise) {
    workerUtilsPromise = makeWorkerUtils({ connectionString });
  }
  return workerUtilsPromise;
}

export async function startWorker(): Promise<Runner> {
  if (runner) return runner;
  runner = await run(
    {
      connectionString,
      concurrency: CONCURRENCY,
      taskList: {
        // biome-ignore lint/suspicious/noExplicitAny: graphile's JobHelpers typing requires the full interface; we only need job.id.
        [DISPATCH_TASK]: async (payload: unknown, helpers: any) => {
          await dispatch(payload as DispatchPayload, String(helpers.job.id));
        },
      },
    },
    // Pass parsedCronItems=[] so Graphile skips crontab-file discovery (we
    // don't use file-based cron; a future plugin will contribute CronSource).
    undefined,
    [],
  );
  return runner;
}

export async function stopWorker(): Promise<void> {
  if (runner) {
    await runner.stop();
    runner = null;
  }
  if (workerUtilsPromise) {
    const utils = await workerUtilsPromise;
    await utils.release();
    workerUtilsPromise = null;
  }
}

// Matches the preservation policy in docs/events.md §"Preservation policy":
// unknown action, config drift, and unknown event all log and COMPLETE the
// job without throwing — the trigger row is preserved but the Graphile job
// is removed so it doesn't retry forever. Handler throws bubble up so
// Graphile retries up to max_attempts.
async function dispatch(p: DispatchPayload, runId: string): Promise<void> {
  const action = actionRegistry.get(p.actionName);
  if (!action) {
    console.warn(
      `[events] unknown action "${p.actionName}" (event "${p.eventName}", trigger ${p.triggerId}); preserving row`,
    );
    return;
  }

  const parsed = action.schema.safeParse(p.actionConfig);
  if (!parsed.success) {
    console.warn(
      `[events] config drift for action "${p.actionName}" (event "${p.eventName}", trigger ${p.triggerId}); preserving row:`,
      parsed.error.issues,
    );
    return;
  }

  const table = triggerTableRegistry.get(p.eventName);
  if (!table) {
    console.warn(
      `[events] unknown event "${p.eventName}" at dispatch (trigger ${p.triggerId}); preserving row`,
    );
    return;
  }

  await action.run(parsed.data, {
    payload: p.eventPayload,
    triggerId: p.triggerId,
    table,
    runId,
  });

  if (p.oneShot) {
    await db
      .delete(table)
      // biome-ignore lint/suspicious/noExplicitAny: dynamic id column access.
      .where(eq((table as any).id as AnyPgColumn, p.triggerId));
  }
}
