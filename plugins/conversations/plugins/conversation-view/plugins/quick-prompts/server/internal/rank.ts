import { desc } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "../../../../../../../../server/src/db/client";
import { quickPromptsTable } from "./tables";

export async function nextRank(): Promise<string> {
  const [last] = await db
    .select({ rank: quickPromptsTable.rank })
    .from(quickPromptsTable)
    .orderBy(desc(quickPromptsTable.rank))
    .limit(1);
  return generateKeyBetween(last?.rank ?? null, null);
}
