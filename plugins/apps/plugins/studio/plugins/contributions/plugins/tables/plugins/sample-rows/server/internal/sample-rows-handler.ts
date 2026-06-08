import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getTableSampleRows } from "../../shared/endpoints";

export const handleGetSampleRows = implement(getTableSampleRows, async ({ params }) => {
  const { tableName } = params;

  const exists = await db.execute<{ table_name: string }>(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${tableName}`,
  );
  if (exists.rows.length === 0) {
    throw new HttpError(404, "Table not found");
  }

  const quotedTable = `"${tableName.replace(/"/g, '""')}"`;
  const result = await db.execute<Record<string, unknown>>(
    sql`SELECT * FROM ${sql.raw(quotedTable)} LIMIT 10`,
  );

  const columns =
    result.rows.length > 0 ? Object.keys(result.rows[0]!) : [];

  return { columns, rows: result.rows };
});
