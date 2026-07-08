import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as Y from "yjs";
import { HttpError } from "@plugins/infra/plugins/endpoints/core";
import type { BlockDocRow } from "../../core";
import { _pageBlockDocs } from "./tables";

// Content-agnostic persistence for per-block Yjs docs. db-PARAMETRIZED (the
// live-state-snapshot `persist.ts` precedent) so the real SQL — the ON CONFLICT
// first-writer-wins seed and the SELECT … FOR UPDATE merge — is exercised
// against a throwaway Postgres in `doc-store.test.ts`; the `db` singleton is
// bound only in `routes.ts` / `resource.ts`.

/** The single JS home for state-bytes → wire base64 (resource + doc-init). */
export function stateToBase64(state: Uint8Array): string {
  return Buffer.from(state).toString("base64");
}

/**
 * node-postgres surfaces a foreign_key_violation as SQLSTATE 23503 (the
 * `page_block_docs.block_id → page_blocks.id` FK when the block row doesn't
 * exist). Drizzle may wrap the pg error, so check `cause` too — mirrors the
 * `run-build.ts` 23505 precedent.
 */
function isForeignKeyViolation(err: unknown): boolean {
  const code =
    (err as { code?: string } | null)?.code ??
    (err as { cause?: { code?: string } } | null)?.cause?.code;
  return code === "23503";
}

/**
 * First-writer-wins seed: insert the proposed initial state unless a row
 * already exists (`ON CONFLICT DO NOTHING`), then return the authoritative
 * stored state — the winner's bytes for a losing seeder, the caller's own for
 * the winner. This is the ONLY place a `page_block_docs` row is created.
 *
 * 404 when the block row doesn't exist (the FK precondition): a raw 23503
 * would surface as an opaque 500. Clients gate doc-init on the block being
 * server-confirmed (the provider's `markBlockRowConfirmed`), so hitting this
 * means the block was deleted concurrently — same semantics as the
 * select-after-insert 404 below.
 */
export async function initBlockDoc(
  db: NodePgDatabase,
  blockId: string,
  state: Uint8Array,
): Promise<Uint8Array> {
  try {
    await db
      .insert(_pageBlockDocs)
      .values({ blockId, state })
      .onConflictDoNothing({ target: _pageBlockDocs.blockId });
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      throw new HttpError(404, `block ${blockId} does not exist`);
    }
    throw err;
  }
  const [row] = await db
    .select({ state: _pageBlockDocs.state })
    .from(_pageBlockDocs)
    .where(eq(_pageBlockDocs.blockId, blockId));
  if (!row) {
    // Unreachable unless the block was deleted between insert and select — the
    // FK cascade dropped the row. Loud: the caller is racing a delete.
    throw new HttpError(404, `block ${blockId} no longer exists`);
  }
  return row.state;
}

/**
 * Merge an incremental Yjs update into a block's stored doc, atomically:
 * `SELECT … FOR UPDATE` serializes concurrent merges on the row, the merge is
 * `Y.mergeUpdates` on the raw update bytes (CRDT merge — idempotent and
 * commutative, so replays and races converge) with no intermediate `Y.Doc`,
 * and the UPDATE commits state + updatedAt together. The committed UPDATE fires
 * the DB change-feed, which pushes `blockContentResource` to the block's
 * subscribers. `Y.mergeUpdates` requires the v1 update format (the Yjs default
 * used throughout — stored `state` is an `encodeStateAsUpdate` full state,
 * `update` a v1 incremental), so it is byte-equivalent to the doc rebuild.
 *
 * 409 when the doc was never initialized: auto-seeding here would reopen the
 * duplicate-seed hazard `doc-init` exists to close.
 */
export async function mergeBlockDocUpdate(
  db: NodePgDatabase,
  blockId: string,
  update: Uint8Array,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ state: _pageBlockDocs.state })
      .from(_pageBlockDocs)
      .where(eq(_pageBlockDocs.blockId, blockId))
      .for("update");
    if (!row) {
      throw new HttpError(
        409,
        `block ${blockId} has no content doc — POST /api/blocks/${blockId}/doc-init first`,
      );
    }
    const merged = Y.mergeUpdates([row.state, update]);
    await tx
      .update(_pageBlockDocs)
      .set({ state: merged, updatedAt: new Date() })
      .where(eq(_pageBlockDocs.blockId, blockId));
  });
}

/**
 * The `blockContentResource` read: the block's row as a 0-or-1-element wire
 * array (base64 state). Param-scoped to one block, so the "scoped" and "full"
 * recomputes are the same single-row query — the loader can ignore
 * `ctx.affectedIds` without ever over-returning.
 */
export async function loadBlockDoc(
  db: NodePgDatabase,
  blockId: string,
): Promise<BlockDocRow[]> {
  const rows = await db
    .select()
    .from(_pageBlockDocs)
    .where(eq(_pageBlockDocs.blockId, blockId));
  return rows.map((row) => ({
    blockId: row.blockId,
    state: stateToBase64(row.state),
    updatedAt: row.updatedAt,
  }));
}
