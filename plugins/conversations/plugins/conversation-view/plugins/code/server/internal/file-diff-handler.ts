import { getConversation } from "@plugins/tasks-core/server";
import { getFileDiff } from "./get-file-diff";

export async function handleFileDiff(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });

  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path) return new Response("Missing path", { status: 400 });
  const base = url.searchParams.get("base") ?? "HEAD";

  const row = await getConversation(id);
  if (!row) return new Response("Not found", { status: 404 });

  const result = await getFileDiff(row.worktreePath, path, base);
  if (result.kind === "ok") {
    return Response.json({ diff: result.diff });
  }
  return new Response(result.message, { status: result.status });
}
