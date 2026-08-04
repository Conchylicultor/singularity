import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import type {
  EventSource,
  RunOutcome,
} from "@plugins/apps/plugins/events/plugins/events-core/core";
import {
  _eventSources,
  _eventSourceRuns,
} from "@plugins/apps/plugins/events/plugins/events-core/server";
import type { RefreshErrorClassification } from "./classify-error";
import { computeNextRunAt } from "./schedule";

// The ONLY writer of `event_source_runs` and of a source row's runtime state.
//
// Every run ends here, and every ending writes BOTH tables in one transaction:
// the ledger row (what happened) and the source row (status, fingerprint,
// watermarks, classified error). Keeping the pair atomic is what makes the two
// answerable together — a source that says `error` always has the failed run row
// that explains it, and a source that says `idle` never has a half-written run.
//
// The row is written at the END of the run, not the start: an in-flight run is
// already visible as `status: "running"` on the live-pushed source row, so a
// second "started" write would only buy the ability to leave a half-row behind
// on a crash. Every ledger row is therefore complete by construction.

type SourceStatePatch = Partial<typeof _eventSources.$inferInsert>;

interface RunCounts {
  found: number;
  created: number;
  updated: number;
  disappeared: number;
}

const NO_COUNTS: RunCounts = {
  found: 0,
  created: 0,
  updated: 0,
  disappeared: 0,
};

/**
 * Flip a source to `running` before the first phase. Also the wedge cure: a
 * backend killed mid-run leaves the row stuck at `running`, and the next run
 * (cadence tick or "Refresh now") reclaims it here rather than needing a sweep.
 */
export async function markSourceRunning(sourceId: string): Promise<void> {
  await db
    .update(_eventSources)
    .set({ status: "running", updatedAt: new Date() })
    .where(eq(_eventSources.id, sourceId));
}

/**
 * Write the ledger row and the source row together. `finishedAt` is the single
 * clock read both derive from, so `durationMs` and `lastRunAt` can never
 * disagree.
 */
async function completeRun(
  source: EventSource,
  run: {
    finishedAt: Date;
    startedAt: Date;
    outcome: RunOutcome;
    fingerprint: string | null;
    counts: RunCounts;
    error: string | null;
  },
  sourceState: SourceStatePatch,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(_eventSourceRuns).values({
      id: randomUUID(),
      sourceId: source.id,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      outcome: run.outcome,
      eventsFound: run.counts.found,
      eventsCreated: run.counts.created,
      eventsUpdated: run.counts.updated,
      eventsDisappeared: run.counts.disappeared,
      fingerprint: run.fingerprint,
      durationMs: run.finishedAt.getTime() - run.startedAt.getTime(),
      error: run.error,
    });
    await tx
      .update(_eventSources)
      .set({
        lastRunAt: run.finishedAt,
        // Measured from the END of the run, so a slow source cannot accumulate
        // a backlog of overdue ticks.
        nextRunAt: computeNextRunAt(source.refresh, run.finishedAt),
        updatedAt: run.finishedAt,
        ...sourceState,
      })
      .where(eq(_eventSources.id, source.id));
  });
}

/**
 * The cache hit: the probe fingerprint matched, so `extract` was never called
 * and no model call was paid for. Recorded anyway — a run that deliberately did
 * nothing is precisely what "why did nothing happen" needs to see.
 */
export async function finishUnchanged(
  source: EventSource,
  args: { startedAt: Date; fingerprint: string },
): Promise<void> {
  await completeRun(
    source,
    {
      finishedAt: new Date(),
      startedAt: args.startedAt,
      outcome: "unchanged",
      fingerprint: args.fingerprint,
      counts: NO_COUNTS,
      error: null,
    },
    // The fingerprint is unchanged by definition; a successful run clears any
    // error the previous one left behind.
    { status: "idle", lastError: null, lastErrorCode: null },
  );
}

/** The full path: extraction ran, the diff landed, the fingerprint advances. */
export async function finishExtracted(
  source: EventSource,
  args: { startedAt: Date; fingerprint: string | null; counts: RunCounts },
): Promise<void> {
  await completeRun(
    source,
    {
      finishedAt: new Date(),
      startedAt: args.startedAt,
      outcome: "extracted",
      fingerprint: args.fingerprint,
      counts: args.counts,
      error: null,
    },
    {
      // A `null` fingerprint is stored verbatim: the source declared it cannot
      // be fingerprinted cheaply, so the next run must extract again. Writing a
      // placeholder here would silently turn that into a permanent cache hit.
      lastFingerprint: args.fingerprint,
      status: "idle",
      lastError: null,
      lastErrorCode: null,
    },
  );
}

/**
 * A failed run. `lastFingerprint` is deliberately untouched — a failure taught
 * us nothing about the source's content, and advancing the cache key would make
 * the NEXT run skip extraction for material we never actually read.
 *
 * A TERMINAL failure parks the source in `status: "error"` with the classified
 * message; a TRANSIENT one drops back to `idle` and leaves the source row's
 * error columns alone, because graphile is still retrying and the detail already
 * lives on this run row (`lastError` is documented as terminal-only).
 */
export async function finishFailed(
  source: EventSource,
  args: { startedAt: Date; failure: RefreshErrorClassification },
): Promise<void> {
  const { failure } = args;
  await completeRun(
    source,
    {
      finishedAt: new Date(),
      startedAt: args.startedAt,
      outcome: "failed",
      fingerprint: null,
      counts: NO_COUNTS,
      error: `${failure.code}: ${failure.message}`,
    },
    failure.terminal
      ? {
          status: "error",
          lastError: failure.message,
          lastErrorCode: failure.code,
        }
      : { status: "idle" },
  );
}
