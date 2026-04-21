import { stat } from "node:fs/promises";
import { getAttempt } from "@plugins/tasks-core/server";
import { dropDatabase } from "../../../../../conversations/server/internal/db-fork";
import { removeWorktree } from "../../../../../../server/src/worktree";

export async function handleDelete(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const { id } = params;
  if (!id) return Response.json({ ok: false, error: "Missing id" }, { status: 400 });

  const attempt = await getAttempt(id);
  if (!attempt) return Response.json({ ok: false, error: "Attempt not found" }, { status: 404 });

  let dirPresent = false;
  try {
    await stat(attempt.worktreePath);
    dirPresent = true;
  } catch {
    // Directory already gone — skip git step
  }

  if (dirPresent) {
    try {
      await removeWorktree(attempt.worktreePath);
    } catch (e) {
      return Response.json({ ok: false, error: String(e) }, { status: 500 });
    }
  }

  await dropDatabase(id);

  return Response.json({ ok: true });
}
