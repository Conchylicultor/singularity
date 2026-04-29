import { stat } from "node:fs/promises";
import { getAttempt } from "@plugins/tasks-core/server";
import { dropDatabase } from "@plugins/conversations/server";
import { removeWorktree } from "@server/worktree";

export async function handleDelete(
  _req: Request,
  params: Record<string, string>,
): Promise<Response> {
  const { id } = params;
  if (!id) return Response.json({ ok: false, error: "Missing id" }, { status: 400 });

  const attempt = await getAttempt(id);
  if (!attempt) return Response.json({ ok: false, error: "Attempt not found" }, { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));

      let dirPresent = false;
      try {
        await stat(attempt.worktreePath);
        dirPresent = true;
      } catch {
        // Directory already gone — skip git step
      }

      if (dirPresent) {
        emit({ step: "worktree" });
        try {
          await removeWorktree(attempt.worktreePath);
        } catch (e) {
          emit({ ok: false, error: String(e) });
          controller.close();
          return;
        }
      }

      emit({ step: "database" });
      await dropDatabase(id);

      emit({ ok: true });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
