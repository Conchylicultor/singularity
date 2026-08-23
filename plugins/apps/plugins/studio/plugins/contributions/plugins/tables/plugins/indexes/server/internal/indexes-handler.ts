import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { executeRows } from "@plugins/database/plugins/sql-rows/core";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getTableIndexes, IndexSchema } from "../../shared/endpoints";

// `information_schema.tables.table_name` is `name` (OID 19) — scalar, decoded
// as a string.
const TableNameRowSchema = z.object({ table_name: z.string() });

export const handleGetIndexes = implement(
  getTableIndexes,
  async ({ params }) => {
    const { tableName } = params;

    const tableCheck = await executeRows(db, {
      query: sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${tableName}`,
      row: TableNameRowSchema,
      label: "studio table exists (indexes)",
    });
    if (tableCheck.length === 0) {
      throw new HttpError(404, "Table not found");
    }

    // The wire contract IS the row shape here (`pg_indexes.indexname` is `name`,
    // `indexdef` is `text`), so the endpoint's own schema parses the read.
    const indexes = await executeRows(db, {
      query: sql`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ${tableName} ORDER BY indexname`,
      row: IndexSchema,
      label: "studio table indexes",
    });

    return { indexes };
  },
);
