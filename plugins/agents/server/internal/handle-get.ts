import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { getAgent } from "../../core/endpoints";
import { AgentSchema } from "../../core/schemas";
import { agents } from "./schema";

export const handleGet = implement(getAgent, async ({ params }) => {
  const [row] = await db.select().from(agents).where(eq(agents.id, params.id)).limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(404, "Not found");
  return AgentSchema.parse(row);
});
