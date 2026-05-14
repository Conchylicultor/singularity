import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import type { HttpHandler } from "@server/types";

export const handleGetForeignKeys: HttpHandler = async (_req, params) => {
  const tableName = params["tableName"];
  if (!tableName) {
    return Response.json({ error: "Missing tableName" }, { status: 400 });
  }

  const tableCheck = await db.execute(
    sql`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${tableName}`,
  );
  if (tableCheck.rows.length === 0) {
    return Response.json({ error: "Table not found" }, { status: 404 });
  }

  const [outgoingResult, incomingResult] = await Promise.all([
    db.execute(
      sql`SELECT tc.constraint_name, kcu.column_name,
             ccu.table_name AS foreign_table, ccu.column_name AS foreign_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
         AND tc.table_name = ${tableName}
       ORDER BY tc.constraint_name, kcu.column_name`,
    ),
    db.execute(
      sql`SELECT tc.constraint_name, tc.table_name AS source_table, kcu.column_name AS source_column,
             ccu.column_name AS target_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
       WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
         AND ccu.table_name = ${tableName}
       ORDER BY tc.table_name, tc.constraint_name`,
    ),
  ]);

  return Response.json({
    outgoing: outgoingResult.rows,
    incoming: incomingResult.rows,
  });
};
