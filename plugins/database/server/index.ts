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
import { applySchemaLayer } from "@plugins/database/plugins/migrations/server";
import { View } from "@plugins/database/plugins/derived-views/server";
import { DerivedTable } from "@plugins/database/plugins/derived-tables/server";
import { registeredDerivedUpdatedAt } from "@plugins/database/plugins/derived-updated-at/server";

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
  // guarantee real and lets the gateway hold the hot-swap until the schema layer
  // commits.
  async onReadyBlocking() {
    await awaitDbReady();
    await warmPool();
    // The boot schema layer, in ONE transaction: views out (only when a
    // migration is pending) → pending migrations, each phased schema migration
    // as expand → claimed data → contract → the derived `updatedAt` triggers →
    // the trigger-maintained rollup tables (before the views: `attempts_v` LEFT
    // JOINs them) → the plain views. The previous backend, still serving during a
    // hot-swap, waits on its locks rather than reading missing views, and any
    // failure leaves the whole layer as it was. See
    // plugins/database/plugins/derived-views/CLAUDE.md and
    // research/2026-09-29-global-phased-migrations.md.
    //
    // The derived inputs are read HERE and passed in, never read inside the
    // layer: contributions are collected (and every `tables.ts` has run
    // `defineEntity`) before any `onReadyBlocking`, and the dry-run check that
    // runs the same layer from a process that never booted gathers them its
    // own way.
    //
    // Boot DDL can wait minutes on the previous backend's locks during a
    // hot-swap, so the layer widens the query deadline for its own queries. The
    // wrap lives here, at the call site: the layer takes `db` as a parameter
    // precisely so it never imports this barrel (that would cycle).
    await withQueryDeadline(
      { ms: BOOT_DDL_QUERY_DEADLINE_MS, reason: "boot: schema layer" },
      () =>
        applySchemaLayer(
          db,
          {
            views: View.getContributions(),
            derivedTables: DerivedTable.getContributions(),
            updatedAtSpecs: registeredDerivedUpdatedAt(),
          },
          { commit: true },
        ),
    );
    // Last, because every relation a loader can read now exists. This is the
    // snapshot that tells an unquoted table name in a loader's raw SQL apart
    // from a CTE name or a subquery alias, so its read-set records the tables it
    // really depends on (`extractReadTablesFromSql`). One cheap catalog read,
    // not DDL — it waits on no lock, so it keeps the ordinary query deadline
    // rather than the widened boot one the schema layer above needs.
    await loadKnownRelations(db);
  },
} satisfies ServerPluginDefinition;
