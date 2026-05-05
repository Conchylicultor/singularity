import { resumeConversation } from "@plugins/conversations/server";
import { recentConversationsResource } from "@plugins/tasks-core/server";

type RestoreResult = { id: string; ok: true } | { id: string; ok: false; error: string };

export async function handleRestoreBatch(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids = (body as { ids?: unknown })?.ids;
  if (!Array.isArray(ids) || !ids.every((x): x is string => typeof x === "string")) {
    return Response.json({ error: "Expected { ids: string[] }" }, { status: 400 });
  }
  if (ids.length === 0) {
    return Response.json({ results: [] satisfies RestoreResult[] });
  }

  const results: RestoreResult[] = await Promise.all(
    ids.map(async (id): Promise<RestoreResult> => {
      try {
        await resumeConversation(id);
        return { id, ok: true };
      } catch (err) {
        return { id, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );
  recentConversationsResource.notify();
  return Response.json({ results });
}
