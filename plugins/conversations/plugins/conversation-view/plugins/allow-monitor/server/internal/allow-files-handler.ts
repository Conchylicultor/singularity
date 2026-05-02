import { join } from "path";
import { getConversation } from "@plugins/tasks-core/server";

const ALLOW_FILES = [".allow-main", ".allow-migrations"] as const;

export async function handleGetAllowFiles(
  _req: Request,
  { id }: Record<string, string>,
): Promise<Response> {
  if (!id) return new Response("Missing id", { status: 400 });

  const conversation = await getConversation(id);
  if (!conversation?.worktreePath) {
    return Response.json({ allowFiles: [] });
  }

  const results = await Promise.all(
    ALLOW_FILES.map(async (name) => ({
      name,
      exists: await Bun.file(join(conversation.worktreePath!, name)).exists(),
    })),
  );

  return Response.json({
    allowFiles: results.filter((r) => r.exists).map((r) => r.name),
  });
}
