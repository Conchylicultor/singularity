import { getImproveConfig, setImproveConfig } from "./config-store";
import { improveConfigResource } from "./resources";

export async function handleGetConfig(): Promise<Response> {
  const cfg = await getImproveConfig();
  return Response.json(cfg);
}

export async function handlePatchConfig(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as
    | { promptTemplate?: unknown }
    | null;
  if (!body) return new Response("invalid body", { status: 400 });
  if (body.promptTemplate !== undefined && typeof body.promptTemplate !== "string") {
    return new Response("promptTemplate must be a string", { status: 400 });
  }
  const next = await setImproveConfig({
    promptTemplate: body.promptTemplate as string | undefined,
  });
  improveConfigResource.notify();
  return Response.json(next);
}
