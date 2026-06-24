// Runtime-agnostic Zero replication-slot / publication cleanup SQL. Kept light
// (no @plugins server imports, no DOM types) so BOTH the foreground supervisor
// script `scripts/start.ts` (tools tsconfig, ES2023 lib, its own `pg` client)
// AND the server helper `server/internal/slot-lifecycle.ts` (via the admin
// pool) can share one implementation. Importing the admin SERVER barrel from a
// script would pull the endpoints codec (BodyInit/FormData — DOM types) into the
// no-DOM tools program; this seam avoids that by taking a plain query runner.

// Zero names its logical replication slots with a `zero` prefix (e.g. `zero_<…>`)
// and its publications `_zero_metadata_0` / `_zero_public_0`. We match the whole
// family so a slot/publication created by any zero-cache version is reclaimed.
const ZERO_SLOT_LIKE = "zero%";
const ZERO_PUBLICATION_LIKE = "\\_zero%";

// A minimal query runner satisfied by both `pg.Client` and the admin pool's
// short-lived client: `(text, params) => Promise<{ rows }>`.
export type RunSql = (
  text: string,
  params?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;

/**
 * Drop every Zero logical replication slot + publication on the fork DB `dbName`
 * over the given query runner (which must already be connected to that DB).
 *
 * Idempotent and tolerant of "nothing to drop" — a worktree that never ran Zero
 * has no slot/publication and this no-ops. A slot still held `active` by a live
 * walsender cannot be dropped; we log and continue rather than abort the
 * surrounding reap/sweep/pre-flight (the idle sweep reclaims it once the process
 * is gone). All other errors propagate (fail loud).
 *
 * `pg_replication_slots` is a CLUSTER-global view, so we filter to slots whose
 * `database` column is this fork; publications are per-database, so the runner's
 * connection to `dbName` scopes them automatically.
 */
export async function dropZeroSlotsAndPublications(
  dbName: string,
  run: RunSql,
): Promise<void> {
  const slots = await run(
    `SELECT slot_name FROM pg_replication_slots
      WHERE database = $1 AND slot_name LIKE $2`,
    [dbName, ZERO_SLOT_LIKE],
  );
  for (const row of slots.rows) {
    const slotName = row.slot_name as string;
    try {
      await run("SELECT pg_drop_replication_slot($1)", [slotName]);
    } catch (err) {
      if (isSlotActiveError(err)) {
        console.warn(
          `zero slot cleanup: slot ${slotName} on ${dbName} is still active; leaving for the idle sweep`,
        );
        continue;
      }
      throw err;
    }
  }

  const publications = await run(
    `SELECT pubname FROM pg_publication WHERE pubname LIKE $1`,
    [ZERO_PUBLICATION_LIKE],
  );
  for (const row of publications.rows) {
    const pubname = row.pubname as string;
    // Identifier can't be parameterized; pubname comes from pg_publication so it
    // is a real existing identifier — quote it defensively all the same.
    await run(`DROP PUBLICATION IF EXISTS "${pubname.replace(/"/g, '""')}"`);
  }
}

// node-postgres surfaces "replication slot is active" as error code 55006
// (object_in_use). Match on the code, falling back to the message for safety.
function isSlotActiveError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  if (code === "55006") return true;
  const message = (err as { message?: string } | null)?.message ?? "";
  return /replication slot .* is active/i.test(message);
}
