import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { getConfig } from "@plugins/config_v2/server";
import { isHostSingleton } from "@plugins/infra/plugins/paths/core";
import {
  INDEX_DERIVATION_VERSION,
  INDEX_SCOPE_SETTINGS,
  resolveLoadScope,
  type IndexLoadPhase,
  type IndexStatus,
  type SkipSummary,
} from "../../core";
import { songIndexConfig } from "../../shared/config";
import { SNAPSHOT_NAME } from "./dump-files";
import { indexStatus, type IndexStateView, type IndexTarget } from "./status";
import {
  SINGLETON_ROW_ID,
  _chordIndexRequest,
  _chordIndexState,
} from "./tables";

// ── Reads and writes of the two singleton rows ───────────────────────────────
//
// Every write here is its own statement on the pool, never inside the load's
// batches: the state row is how a load running in a child process shows its
// progress, so each write has to commit on its own to reach the change feed.

/** What a load on this instance must produce: resolved now, from the config and where this process runs. */
export function currentIndexTarget(): IndexTarget {
  // The enum field reads back as a string; parsed, so a hand-edited value fails loudly.
  const setting = z
    .enum(INDEX_SCOPE_SETTINGS)
    .parse(getConfig(songIndexConfig).scope);
  return {
    snapshotName: SNAPSHOT_NAME,
    scope: resolveLoadScope(setting, isHostSingleton()),
    derivationVersion: INDEX_DERIVATION_VERSION,
  };
}

/**
 * The state row, as the rules read it.
 *
 * Exactly the `IndexStateView` columns, never `select()`: `skipped` is a jsonb
 * list a human opens when a load surprises them, and decoding it on every
 * status read — every `ensure`, every push of the live status — would be work
 * for a value nothing on this path looks at.
 */
export async function readIndexState(): Promise<IndexStateView | null> {
  const [row] = await db
    .select({
      snapshotName: _chordIndexState.snapshotName,
      scope: _chordIndexState.scope,
      derivationVersion: _chordIndexState.derivationVersion,
      phase: _chordIndexState.phase,
      done: _chordIndexState.done,
      total: _chordIndexState.total,
      windows: _chordIndexState.windows,
      error: _chordIndexState.error,
    })
    .from(_chordIndexState)
    .where(eq(_chordIndexState.id, SINGLETON_ROW_ID));
  return row ?? null;
}

export async function isIndexRequested(): Promise<boolean> {
  const rows = await db
    .select({ id: _chordIndexRequest.id })
    .from(_chordIndexRequest)
    .where(eq(_chordIndexRequest.id, SINGLETON_ROW_ID));
  return rows.length > 0;
}

export async function loadIndexStatus(): Promise<IndexStatus> {
  const [requested, state] = await Promise.all([
    isIndexRequested(),
    readIndexState(),
  ]);
  return indexStatus(requested, state);
}

/** Record that this instance uses the app. Keeps the first request's time. */
export async function recordIndexRequest(): Promise<void> {
  await db
    .insert(_chordIndexRequest)
    .values({ id: SINGLETON_ROW_ID })
    .onConflictDoNothing();
}

/** Forget a failed load, so the status says `queued` until the retry starts. */
export async function clearFailedIndexState(): Promise<void> {
  await db.delete(_chordIndexState).where(eq(_chordIndexState.phase, "failed"));
}

/** Start a load: the row now describes it, with nothing counted yet. */
export async function beginIndexLoad(
  target: IndexTarget,
  phase: IndexLoadPhase,
): Promise<void> {
  const now = new Date();
  // No `updatedAt`: the column defaults on insert and is derived on update.
  const row = {
    id: SINGLETON_ROW_ID,
    ...target,
    phase,
    done: null,
    total: null,
    windows: null,
    error: null,
    skipped: [],
    startedAt: now,
    finishedAt: null,
  };
  await db
    .insert(_chordIndexState)
    .values(row)
    .onConflictDoUpdate({ target: _chordIndexState.id, set: row });
}

async function updateState(
  set: Partial<Omit<typeof _chordIndexState.$inferInsert, "updatedAt">>,
): Promise<void> {
  // `updatedAt` is derived: the trigger bumps it when a column here changes.
  await db
    .update(_chordIndexState)
    .set(set)
    .where(eq(_chordIndexState.id, SINGLETON_ROW_ID));
}

export async function setIndexPhase(phase: IndexLoadPhase): Promise<void> {
  await updateState({ phase });
}

export async function setIndexProgress(
  done: number,
  total: number,
): Promise<void> {
  await updateState({ phase: "loading", done, total });
}

export async function markIndexReady(result: {
  sections: number;
  windows: number;
  skipped: SkipSummary;
}): Promise<void> {
  await updateState({
    phase: "ready",
    done: result.sections,
    windows: result.windows,
    skipped: result.skipped,
    finishedAt: new Date(),
  });
}

export async function markIndexFailed(error: string): Promise<void> {
  await updateState({ phase: "failed", error, finishedAt: new Date() });
}
