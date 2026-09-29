import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { executeRows } from "@plugins/database/plugins/sql-rows/core";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getPushesThroughput } from "../../shared/endpoints";
import { completedPushes } from "./read-pushes";

const Row = z.object({
  bucket: z.string(),
  success: z.coerce.number(),
  failed: z.coerce.number(),
});

// Success vs failed pushes per bucket, bucketed on `requestedAt`. Every
// non-success terminal (failed_rebase / failed_checks / failed_push / error)
// counts as failed.
export const handleThroughput = implement(
  getPushesThroughput,
  async ({ query }) => {
    const rows = await executeRows(db, {
      label: "stats-pushes:throughput",
      row: Row,
      query: sql`
        SELECT bucket,
               count(*) FILTER (WHERE outcome = 'success')::int AS success,
               count(*) FILTER (WHERE outcome <> 'success')::int AS failed
          FROM ${completedPushes(query.bucket ?? "day")} p
         GROUP BY bucket
         ORDER BY bucket`,
    });
    return { points: rows };
  },
);
