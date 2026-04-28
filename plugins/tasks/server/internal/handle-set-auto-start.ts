import { z } from "zod";
import { setTaskAutoStart } from "@plugins/tasks-core/server";

const ModelSchema = z.enum(["opus", "sonnet"]);

export async function handleSetAutoStart(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const taskId = params.id;
  if (!taskId) return new Response("missing task id", { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = ModelSchema.safeParse(body?.model);
  if (!parsed.success) {
    return new Response("invalid model — must be 'opus' or 'sonnet'", { status: 400 });
  }

  const ok = await setTaskAutoStart(taskId, { model: parsed.data });
  if (!ok) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 204 });
}
