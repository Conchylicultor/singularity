import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";

export async function handleGetRowCount(
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

  const result = await db.execute<{ estimate: number | null }>(
    sql`SELECT n_live_tup::int AS estimate FROM pg_stat_user_tables WHERE relname = ${tableName}`,
  );

  return Response.json({ estimate: result.rows[0]?.estimate ?? null });
}
