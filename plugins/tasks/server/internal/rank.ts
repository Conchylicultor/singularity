import { desc, eq, isNull } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db } from "../../../../server/src/db/client";
import { _tasks } from "../schema_internal";

type Executor = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

export async function nextRankUnder(
  parentId: string | null,
  executor: Executor = db,
): Promise<string> {
  const [last] = await executor
    .select({ rank: _tasks.rank })
    .from(_tasks)
    .where(
      parentId === null ? isNull(_tasks.parentId) : eq(_tasks.parentId, parentId),
    )
    .orderBy(desc(_tasks.rank))
    .limit(1);
  return generateKeyBetween(last?.rank ?? null, null);
}
