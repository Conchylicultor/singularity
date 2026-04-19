import { eq } from "drizzle-orm";
import { db } from "../../../../../../../../server/src/db/client";
import { conversations } from "@plugins/conversations/server/api";
import { getFileContent } from "./get-file-content";

export async function handleFileContent(
  req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const id = params.id;
  if (!id) return new Response("Missing id", { status: 400 });

  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path) return new Response("Missing path", { status: 400 });

  const [row] = await db
    .select({ worktreePath: conversations.worktreePath })
    .from(conversations)
    .where(eq(conversations.id, id))
    .limit(1);
  if (!row) return new Response("Not found", { status: 404 });

  const result = await getFileContent(row.worktreePath, path);
  switch (result.kind) {
    case "invalid-path":
      return new Response("Invalid path", { status: 400 });
    case "not-found":
      return new Response("File not found", { status: 404 });
    case "too-large":
      return Response.json(
        { error: "too-large", size: result.size },
        { status: 413 },
      );
    case "binary":
      return Response.json({ error: "binary" }, { status: 415 });
    case "ok":
      return Response.json({ content: result.content });
  }
}
