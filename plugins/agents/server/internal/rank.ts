import { desc, eq, isNull } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "../../../../server/src/db/client";
import { _agents } from "../schema_internal";

export async function nextAgentRankUnder(
  parentId: string | null,
): Promise<string> {
  const [last] = await db
    .select({ rank: _agents.rank })
    .from(_agents)
    .where(
      parentId === null ? isNull(_agents.parentId) : eq(_agents.parentId, parentId),
    )
    .orderBy(desc(_agents.rank))
    .limit(1);
  return generateKeyBetween(last?.rank ?? null, null);
}
