import { desc } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "@server/db/client";
import { launchPromptsTable } from "./tables";

export async function nextRank(): Promise<string> {
  const [last] = await db
    .select({ rank: launchPromptsTable.rank })
    .from(launchPromptsTable)
    .orderBy(desc(launchPromptsTable.rank))
    .limit(1);
  return generateKeyBetween(last?.rank ?? null, null);
}
