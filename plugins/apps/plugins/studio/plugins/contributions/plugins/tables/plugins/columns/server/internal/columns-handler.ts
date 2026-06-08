import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getTableColumns } from "../../shared/endpoints";

export const handleGetColumns = implement(getTableColumns, async ({ params }) => {
  const { tableName } = params;

  const tableCheck = await db.execute<{ table_name: string }>(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${tableName}`,
  );
  if (tableCheck.rows.length === 0) {
    throw new HttpError(404, "Table not found");
  }

  const result = await db.execute<{
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
    ordinal_position: number;
  }>(
    sql`SELECT column_name, data_type, is_nullable, column_default, ordinal_position FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${tableName} ORDER BY ordinal_position`,
  );

  return { columns: result.rows };
});
