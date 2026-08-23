import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { executeRows } from "@plugins/database/plugins/sql-rows/core";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getTableColumns, ColumnSchema } from "../../shared/endpoints";

// `information_schema` identifier columns are `name` (OID 19) and its
// `character_data` columns are `varchar` — both scalar, both decoded as
// strings; `ordinal_position` is `int4`, so it really is a number.
const TableNameRowSchema = z.object({ table_name: z.string() });

export const handleGetColumns = implement(
  getTableColumns,
  async ({ params }) => {
    const { tableName } = params;

    const tableCheck = await executeRows(db, {
      query: sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${tableName}`,
      row: TableNameRowSchema,
      label: "studio table exists (columns)",
    });
    if (tableCheck.length === 0) {
      throw new HttpError(404, "Table not found");
    }

    // The wire contract IS the row shape here, so the endpoint's own schema is
    // what parses the read — one definition, no chance of the two drifting.
    const columns = await executeRows(db, {
      query: sql`SELECT column_name, data_type, is_nullable, column_default, ordinal_position FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${tableName} ORDER BY ordinal_position`,
      row: ColumnSchema,
      label: "studio table columns",
    });

    return { columns };
  },
);
