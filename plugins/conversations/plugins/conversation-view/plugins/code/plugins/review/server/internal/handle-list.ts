import { asc } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { reviewSectionsTable } from "./tables";

export async function handleList(): Promise<Response> {
  const rows = await db
    .select()
    .from(reviewSectionsTable)
    .orderBy(
      asc(reviewSectionsTable.rank),
      asc(reviewSectionsTable.createdAt),
    );
  return Response.json(rows);
}
