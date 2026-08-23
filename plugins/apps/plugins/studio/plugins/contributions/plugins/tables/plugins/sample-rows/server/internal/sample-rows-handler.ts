import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import {
  executeRows,
  executeResult,
} from "@plugins/database/plugins/sql-rows/core";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getTableSampleRows } from "../../shared/endpoints";

const TableNameRowSchema = z.object({ table_name: z.string() });

// `SELECT *` over a table nobody named at build time: the honest schema says a
// row is an object and stops there. Widening it further (`z.any()`) or claiming
// a shape would both be lies — this is genuinely all that is known.
const SampleRowSchema = z.record(z.string(), z.unknown());

export const handleGetSampleRows = implement(
  getTableSampleRows,
  async ({ params }) => {
    const { tableName } = params;

    const exists = await executeRows(db, {
      query: sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${tableName}`,
      row: TableNameRowSchema,
      label: "studio table exists (sample rows)",
    });
    if (exists.length === 0) {
      throw new HttpError(404, "Table not found");
    }

    const quotedTable = `"${tableName.replace(/"/g, '""')}"`;
    const result = await executeResult(db, {
      query: sql`SELECT * FROM ${sql.raw(quotedTable)} LIMIT 10`,
      row: SampleRowSchema,
      label: `studio sample rows for ${tableName}`,
    });

    // Column names come from the result descriptor, not from the first row.
    // Reading them off `rows[0]` reported an empty table as having NO columns,
    // which is a claim about its schema that is simply false; `fields` carries the
    // real column list even when the table is empty.
    return { columns: result.fields.map((f) => f.name), rows: result.rows };
  },
);
