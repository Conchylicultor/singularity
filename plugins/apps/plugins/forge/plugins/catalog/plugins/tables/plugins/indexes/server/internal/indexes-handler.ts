import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getTableIndexes } from "../../shared/endpoints";

export const handleGetIndexes = implement(getTableIndexes, async ({ params }) => {
  const { tableName } = params;

  const tableCheck = await db.execute<{ table_name: string }>(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${tableName}`,
  );
  if (tableCheck.rows.length === 0) {
    throw new HttpError(404, "Table not found");
  }

  const result = await db.execute<{ indexname: string; indexdef: string }>(
    sql`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ${tableName} ORDER BY indexname`,
  );

  return { indexes: result.rows };
});
