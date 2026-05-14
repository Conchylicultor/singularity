import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";

export async function handleGetSampleRows(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const tableName = params.tableName;
  if (!tableName) return new Response("Missing tableName", { status: 400 });

  const exists = await db.execute<{ table_name: string }>(
    sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${tableName}`,
  );
  if (exists.rows.length === 0) {
    return new Response("Table not found", { status: 404 });
  }

  const quotedTable = `"${tableName.replace(/"/g, '""')}"`;
  const result = await db.execute<Record<string, unknown>>(
    sql`SELECT * FROM ${sql.raw(quotedTable)} LIMIT 10`,
  );

  const columns =
    result.rows.length > 0 ? Object.keys(result.rows[0]!) : [];

  return Response.json({ columns, rows: result.rows });
}
