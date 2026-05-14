import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";

export async function handleGetIndexes(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const { tableName } = params;
  if (!tableName) return new Response("tableName required", { status: 400 });

  const tableCheck = await db.execute<{ table_name: string }>(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${tableName}`,
  );
  if (tableCheck.rows.length === 0) {
    return new Response("Table not found", { status: 404 });
  }

  const result = await db.execute<{ indexname: string; indexdef: string }>(
    sql`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ${tableName} ORDER BY indexname`,
  );

  return Response.json({ indexes: result.rows });
}
