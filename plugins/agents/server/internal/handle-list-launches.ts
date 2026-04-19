import { desc, eq } from "drizzle-orm";
import { db } from "../../../../server/src/db/client";
import { _agent_launches } from "./tables";

export async function handleListLaunches(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const agentId = params.id;
  if (!agentId) return new Response("Missing id", { status: 400 });
  const rows = await db
    .select()
    .from(_agent_launches)
    .where(eq(_agent_launches.agentId, agentId))
    .orderBy(desc(_agent_launches.createdAt));
  return Response.json(rows);
}
