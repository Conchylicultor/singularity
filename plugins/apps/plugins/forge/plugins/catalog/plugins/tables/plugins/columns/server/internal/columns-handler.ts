import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";

export async function handleGetColumns(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const { tableName } = params;
  if (!tableName) {
    return Response.json({ error: "tableName is required" }, { status: 400 });
  }

  const tableCheck = await db.execute<{ table_name: string }>(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${tableName}`,
  );
  if (tableCheck.rows.length === 0) {
    return Response.json({ error: "Table not found" }, { status: 404 });
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

  return Response.json({ columns: result.rows });
}
