import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { executeRows } from "@plugins/database/plugins/sql-rows/core";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getTableRowCount } from "../../shared/endpoints";

const TableNameRowSchema = z.object({ table_name: z.string() });

// `n_live_tup` is `int8`, which node-postgres hands back as a STRING; the
// `::int` cast in the query is what makes this column genuinely a number.
const EstimateRowSchema = z.object({ estimate: z.number() });

export const handleGetRowCount = implement(
  getTableRowCount,
  async ({ params }) => {
    const { tableName } = params;

    const tableCheck = await executeRows(db, {
      query: sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${tableName}`,
      row: TableNameRowSchema,
      label: "studio table exists (row count)",
    });
    if (tableCheck.length === 0) {
      throw new HttpError(404, "Table not found");
    }

    const rows = await executeRows(db, {
      query: sql`SELECT n_live_tup::int AS estimate FROM pg_stat_user_tables WHERE relname = ${tableName}`,
      row: EstimateRowSchema,
      label: "studio table row-count estimate",
    });

    // `information_schema.tables` also lists views, and a view has no
    // `pg_stat_user_tables` entry at all — so "no row" here means "there is no
    // estimate for this relation", which is exactly what `null` reports. It is a
    // real answer, not a swallowed read failure (a failed read throws above).
    const [row] = rows;
    return { estimate: row?.estimate ?? null };
  },
);
