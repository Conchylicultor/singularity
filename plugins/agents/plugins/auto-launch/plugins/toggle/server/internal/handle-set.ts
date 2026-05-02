import { upsertExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { agentAutoLaunchResource } from "./resource";
import { _agentAutoLaunchExt } from "./tables";

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
  const row = await upsertExtension(_agentAutoLaunchExt, agentId, {
    enabled: body.enabled,
  });
  agentAutoLaunchResource.notify();
  return Response.json(row);
}
