import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "@plugins/database/server";
import type { TaskStatus } from "./schema";
import { flushStatusBatch } from "./status-emit";

// db-or-tx executor, same shape as RankExecutor
// (plugins/primitives/plugins/rank/server/internal/helpers.ts).
export type DbExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface StatusBatch {
  tx: DbExecutor; // the open transaction handle
  before: Map<string, TaskStatus | null>; // earliest entry-status per task
}

const store = new AsyncLocalStorage<StatusBatch>();
export const currentStatusBatch = () => store.getStore();

// Run `fn` in ONE transaction with tasks.statusChanged emits coalesced to the
// NET before→after of the whole operation. Every emitStatusChangeIfChanged call
// inside records its task's entry status but SUPPRESSES its own emit; on commit,
// one trigger is emitted per task whose net status actually differs — enqueued
// on the tx so it lives or dies with the edge writes.
export async function withTaskStatusBatch<T>(
  fn: (tx: DbExecutor) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const batch: StatusBatch = { tx, before: new Map() };
    const result = await store.run(batch, () => fn(tx));
    await flushStatusBatch(batch); // reads net status on tx, emits with { tx }
    return result;
  });
}
