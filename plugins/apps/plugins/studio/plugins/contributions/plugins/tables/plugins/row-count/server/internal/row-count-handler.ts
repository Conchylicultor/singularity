import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getTableRowCount } from "../../shared/endpoints";

export const handleGetRowCount = implement(getTableRowCount, async ({ params }) => {
  const { tableName } = params;

  const tableCheck = await db.execute<{ table_name: string }>(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${tableName}`,
  );
  if (tableCheck.rows.length === 0) {
    throw new HttpError(404, "Table not found");
  }

  const result = await db.execute<{ estimate: number | null }>(
    sql`SELECT n_live_tup::int AS estimate FROM pg_stat_user_tables WHERE relname = ${tableName}`,
  );

  return { estimate: result.rows[0]?.estimate ?? null };
});
