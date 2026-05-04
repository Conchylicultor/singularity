import { agentAutoLaunchResource } from "./resource";
import { agentAutoLaunch } from "./tables";

export async function handleSet(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const agentId = params.agentId;
  if (!agentId) return new Response("Missing agentId", { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { enabled?: boolean };
  if (typeof body.enabled !== "boolean") {
    return new Response("Missing enabled", { status: 400 });
  }
  const row = await agentAutoLaunch.upsert(agentId, { enabled: body.enabled });
  agentAutoLaunchResource.notify();
  return Response.json(row);
}
