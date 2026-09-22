import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import {
  awaitDbReady,
  warmPool,
  db,
  loadKnownRelations,
} from "./internal/client";
import {
  BOOT_DDL_QUERY_DEADLINE_MS,
  withQueryDeadline,
} from "@plugins/database/plugins/connection/server";
import { runMigrations } from "@plugins/database/plugins/migrations/server";
import {
  rebuildDerivedViews,
  View,
} from "@plugins/database/plugins/derived-views/server";
import { rebuildDerivedTables } from "@plugins/database/plugins/derived-tables/server";

export {
  db,
  dbLog,
  awaitDbReady,
  isTransientDbError,
  loadKnownRelations,
} from "./internal/client";
export { currentTxId, type DbExecutor } from "./internal/current-tx-id";

export default {
  description:
    "Core database infrastructure. Connection pooling and DB readiness.",
  loadBearing: true,
  // Blocking: every other plugin's `onReady` (and incoming requests) must see a
  // migrated, warm DB. Running this in the `onReadyBlocking` barrier makes that
  // guarantee real and lets the gateway hold the hot-swap until migrations land.
  async onReadyBlocking() {
    await awaitDbReady();
    await warmPool();
    // Boot DDL can wait minutes on the previous backend's locks during a
    // hot-swap, so each step widens the query deadline for its own queries. The
    // wrap lives here, at the call site: the runners take `db` as a parameter
    // precisely so they never import this barrel (that would cycle).
    await withQueryDeadline(
      { ms: BOOT_DDL_QUERY_DEADLINE_MS, reason: "boot: migrations" },
      () => runMigrations(db),
    );
    // Trigger-maintained materialized rollups (derived-tables) are rebuilt BEFORE
    // the derived views — a derived view may reference a rollup table (e.g.
    // `attempts_v` LEFT JOINs `attempt_conv_agg` / `attempt_push_agg`), so the
    // rollup tables must already exist when `CREATE VIEW` runs or boot fails.
    // Both run sequentially in THIS hook so the order is guaranteed; the
    // onReadyBlocking barrier runs plugins under Promise.all with no topo order,
    // so this ordering could NOT be expressed by leaving the rollup rebuild in
    // change-feed's separate hook. The rollup tables stay feed-exempt regardless
    // of when they are created — change-feed's `listPublicTables` filters them out
    // via the `feedExemptTables()` denylist, so no NOTIFY trigger is ever
    // installed on them. `rebuildDerivedTables` is idempotent (CREATE TABLE IF NOT
    // EXISTS + reconcile) like `rebuildDerivedViews`. See
    // plugins/database/plugins/derived-tables/CLAUDE.md.
    await withQueryDeadline(
      {
        ms: BOOT_DDL_QUERY_DEADLINE_MS,
        reason: "boot: derived-tables rebuild",
      },
      () => rebuildDerivedTables(db),
    );
    // Plain views are derived code, not stateful migration schema: rebuild the
    // whole layer from source (in dependency order) after migrations apply, on
    // existing and fresh DBs alike. See
    // plugins/database/plugins/derived-views/CLAUDE.md.
    await withQueryDeadline(
      { ms: BOOT_DDL_QUERY_DEADLINE_MS, reason: "boot: derived-views rebuild" },
      () => rebuildDerivedViews(db, View.getContributions()),
    );
    // Last, because every relation a loader can read now exists. This is the
    // snapshot that tells an unquoted table name in a loader's raw SQL apart
    // from a CTE name or a subquery alias, so its read-set records the tables it
    // really depends on (`extractReadTablesFromSql`). One cheap catalog read,
    // not DDL — it waits on no lock, so it keeps the ordinary query deadline
    // rather than the widened boot one the three steps above need.
    await loadKnownRelations(db);
  },
} satisfies ServerPluginDefinition;
